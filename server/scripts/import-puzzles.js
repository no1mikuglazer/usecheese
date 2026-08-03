/* One-time import: Lichess puzzle parquet -> SQLite.
 *
 * Usage:
 *   node scripts/import-puzzles.js --parquet ../chess-puzzles.parquet
 *   node scripts/import-puzzles.js --parquet <path> --db <path> \
 *        --min-popularity 50 --min-plays 5
 *
 * Approach:
 *  1. Stream the parquet a slice at a time so the 864MB file is never fully
 *     resident in memory.
 *  2. Insert surviving rows into an unindexed staging table, batched inside
 *     transactions — batching is what makes millions of inserts finish in
 *     minutes rather than hours.
 *  3. Copy staging -> puzzles with a single `ORDER BY rating` INSERT. Because
 *     `puzzles.id` is an INTEGER PRIMARY KEY with no supplied value, SQLite
 *     assigns rowids in arrival order, so id ends up sorted by rating. The
 *     API's random-puzzle query depends on that correlation.
 *  4. Build indexes afterwards (much faster than maintaining them during the
 *     bulk load), then ANALYZE and VACUUM.
 *
 * Re-running is safe: the target tables are dropped and rebuilt from scratch.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { asyncBufferFromFile, parquetReadObjects, parquetMetadataAsync } from "hyparquet";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

// Rows pulled from the parquet per slice. Reads have a fixed per-call decode
// cost, so bigger slices are faster per row but hold more decoded objects in
// memory at once — measured throughput plateaus around here (~400k rows/s at
// a few hundred MB of heap), which is the balance this picks.
const READ_CHUNK = 250_000;

// Rows per SQLite transaction during the staging load.
const INSERT_BATCH = 20_000;

const COLUMNS = [
  "PuzzleId",
  "FEN",
  "Moves",
  "Rating",
  "RatingDeviation",
  "Popularity",
  "NbPlays",
  "Themes",
  "OpeningTags",
];

// The source parquet lives OUTSIDE the repository, in a sibling folder. It is
// far too large to commit (GitHub rejects blobs over 100MB), and keeping it
// out of the working tree also means `git clean -xdf` cannot delete it.
const DEFAULT_PARQUET = path.resolve(
  serverRoot,
  "..",
  "..",
  "Chess_Engine_Web_data",
  "chess-puzzles.parquet",
);

function parseArgs(argv) {
  const args = {
    parquet: DEFAULT_PARQUET,
    db: path.resolve(serverRoot, "data", "cheese.sqlite"),
    minPopularity: 50,
    minPlays: 5,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--parquet":
        args.parquet = path.resolve(value);
        i += 1;
        break;
      case "--db":
        args.db = path.resolve(value);
        i += 1;
        break;
      case "--min-popularity":
        args.minPopularity = Number(value);
        i += 1;
        break;
      case "--min-plays":
        args.minPlays = Number(value);
        i += 1;
        break;
      case "--help":
        console.log(
          "Usage: node scripts/import-puzzles.js [--parquet <path>] [--db <path>] " +
            "[--min-popularity <n>] [--min-plays <n>]",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (!Number.isFinite(args.minPopularity)) throw new Error("--min-popularity must be a number");
  if (!Number.isFinite(args.minPlays)) throw new Error("--min-plays must be a number");
  return args;
}

function createSchema(db) {
  db.exec(`
    DROP TABLE IF EXISTS puzzles_staging;
    DROP TABLE IF EXISTS puzzles;

    CREATE TABLE puzzles (
      id               INTEGER PRIMARY KEY,
      puzzle_id        TEXT    NOT NULL,
      fen              TEXT    NOT NULL,
      moves            TEXT    NOT NULL,
      rating           INTEGER NOT NULL,
      rating_deviation INTEGER NOT NULL,
      popularity       INTEGER NOT NULL,
      nb_plays         INTEGER NOT NULL,
      themes           TEXT    NOT NULL,
      opening_tags     TEXT
    );

    CREATE TABLE puzzles_staging (
      puzzle_id        TEXT,
      fen              TEXT,
      moves            TEXT,
      rating           INTEGER,
      rating_deviation INTEGER,
      popularity       INTEGER,
      nb_plays         INTEGER,
      themes           TEXT,
      opening_tags     TEXT
    );
  `);
}

// Themes/OpeningTags arrive as arrays; SQLite has no array type, so store them
// space-separated and let the API split them back out.
function joinList(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.join(" ") || null;
  return String(value) || null;
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.parquet)) {
    throw new Error(
      `Parquet file not found: ${args.parquet}\n` +
        `Pass --parquet <path> if the source file lives somewhere else.`,
    );
  }
  fs.mkdirSync(path.dirname(args.db), { recursive: true });

  console.log(`source : ${args.parquet}`);
  console.log(`target : ${args.db}`);
  console.log(`filter : popularity >= ${args.minPopularity}, plays >= ${args.minPlays}\n`);

  const startedAt = Date.now();

  const file = await asyncBufferFromFile(args.parquet);
  const metadata = await parquetMetadataAsync(file);
  const totalRows = Number(metadata.num_rows);
  console.log(`${totalRows.toLocaleString()} rows in source\n`);

  const db = new Database(args.db);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF"); // import is re-runnable; durability isn't worth the cost here
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -200000"); // ~200MB page cache for the ORDER BY sort

  createSchema(db);

  const insert = db.prepare(`
    INSERT INTO puzzles_staging
      (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBatch = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });

  let read = 0;
  let kept = 0;
  let pending = [];

  for (let start = 0; start < totalRows; start += READ_CHUNK) {
    const end = Math.min(start + READ_CHUNK, totalRows);
    const rows = await parquetReadObjects({
      file,
      metadata,
      columns: COLUMNS,
      rowStart: start,
      rowEnd: end,
    });

    for (const row of rows) {
      read += 1;
      if (row.Popularity < args.minPopularity) continue;
      if (row.NbPlays < args.minPlays) continue;
      if (!row.FEN || !row.Moves) continue;

      // A puzzle needs the setup move plus at least one solver move.
      if (row.Moves.split(" ").filter(Boolean).length < 2) continue;

      pending.push([
        row.PuzzleId,
        row.FEN,
        row.Moves,
        row.Rating,
        row.RatingDeviation,
        row.Popularity,
        row.NbPlays,
        joinList(row.Themes) || "",
        joinList(row.OpeningTags),
      ]);
      kept += 1;

      if (pending.length >= INSERT_BATCH) {
        insertBatch(pending);
        pending = [];
      }
    }

    const pct = ((end / totalRows) * 100).toFixed(1);
    process.stdout.write(
      `\rreading ${pct}%  (${read.toLocaleString()} read, ${kept.toLocaleString()} kept)   `,
    );
  }

  if (pending.length) insertBatch(pending);
  process.stdout.write("\n\n");

  if (kept === 0) {
    throw new Error("No rows survived filtering — check --min-popularity / --min-plays");
  }

  // Sorted copy: this is what gives `id` its rating ordering.
  console.log("sorting into final table by rating...");
  db.exec(`
    INSERT INTO puzzles
      (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags)
    SELECT puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags
    FROM puzzles_staging
    ORDER BY rating ASC, puzzle_id ASC;
  `);

  console.log("dropping staging table...");
  db.exec("DROP TABLE puzzles_staging;");

  console.log("building indexes...");
  db.exec(`
    CREATE UNIQUE INDEX idx_puzzles_puzzle_id ON puzzles(puzzle_id);
    CREATE INDEX idx_puzzles_rating ON puzzles(rating);
  `);

  console.log("analyzing...");
  db.exec("ANALYZE;");

  console.log("vacuuming (reclaims space from the staging table)...");
  db.pragma("journal_mode = DELETE"); // VACUUM cannot run in WAL with an open WAL file
  db.exec("VACUUM;");
  db.pragma("journal_mode = WAL");

  const stats = db
    .prepare("SELECT COUNT(*) AS count, MIN(rating) AS min, MAX(rating) AS max FROM puzzles")
    .get();
  db.close();

  const sizeMb = (fs.statSync(args.db).size / 1024 / 1024).toFixed(1);

  console.log("\n--- import complete ---");
  console.log(`rows read   : ${read.toLocaleString()}`);
  console.log(`rows kept   : ${stats.count.toLocaleString()} (${((stats.count / read) * 100).toFixed(1)}%)`);
  console.log(`rating range: ${stats.min} - ${stats.max}`);
  console.log(`db size     : ${sizeMb} MB`);
  console.log(`elapsed     : ${formatDuration(Date.now() - startedAt)}`);
}

main().catch((err) => {
  console.error("\nimport failed:", err.message);
  process.exit(1);
});
