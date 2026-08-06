/* Derives a smaller puzzle database from the full one, for hosting on a
 * storage-constrained volume (e.g. Railway's free-tier 500MB cap).
 *
 * Reads the existing, already-filtered `cheese.sqlite` and reservoir-samples
 * up to N puzzles per 100-point rating band, so extremes (which naturally
 * have far fewer puzzles) pass through untouched while dense mid-rating bands
 * get capped. This keeps every difficulty level well represented instead of
 * uniformly downsampling the whole table, which would let the most common
 * ratings crowd out rare high/low ones.
 *
 * Usage:
 *   node scripts/shrink-database.js --source ./data/cheese.sqlite \
 *        --target ./data/cheese.small.sqlite --cap-per-band 70000
 *
 * Much faster than re-running the parquet import: this only touches rows
 * already on disk in SQLite, so it finishes in seconds rather than minutes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

function parseArgs(argv) {
  const args = {
    source: path.resolve(serverRoot, "data", "cheese.sqlite"),
    target: path.resolve(serverRoot, "data", "cheese.small.sqlite"),
    capPerBand: 70_000,
    bandSize: 100,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--source":
        args.source = path.resolve(value);
        i += 1;
        break;
      case "--target":
        args.target = path.resolve(value);
        i += 1;
        break;
      case "--cap-per-band":
        args.capPerBand = Number(value);
        i += 1;
        break;
      case "--band-size":
        args.bandSize = Number(value);
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (!Number.isFinite(args.capPerBand)) throw new Error("--cap-per-band must be a number");
  if (!Number.isFinite(args.bandSize)) throw new Error("--band-size must be a number");
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

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.source)) {
    throw new Error(`Source database not found: ${args.source}`);
  }

  console.log(`source        : ${args.source}`);
  console.log(`target        : ${args.target}`);
  console.log(`cap per band  : ${args.capPerBand.toLocaleString()} (band size ${args.bandSize})\n`);

  const startedAt = Date.now();

  const source = new Database(args.source, { readonly: true });

  fs.mkdirSync(path.dirname(args.target), { recursive: true });
  if (fs.existsSync(args.target)) fs.rmSync(args.target);
  for (const ext of ["-wal", "-shm"]) {
    if (fs.existsSync(args.target + ext)) fs.rmSync(args.target + ext);
  }

  const target = new Database(args.target);
  target.pragma("journal_mode = WAL");
  target.pragma("synchronous = OFF");
  target.pragma("temp_store = MEMORY");

  createSchema(target);

  const { min: minRating, max: maxRating } = source
    .prepare("SELECT MIN(rating) AS min, MAX(rating) AS max FROM puzzles")
    .get();

  const insert = target.prepare(`
    INSERT INTO puzzles_staging
      (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBatch = target.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });

  const sampleBand = source.prepare(`
    SELECT puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags
    FROM puzzles
    WHERE rating >= ? AND rating < ?
    ORDER BY RANDOM()
    LIMIT ?
  `);

  let totalKept = 0;
  const bandStart = Math.floor(minRating / args.bandSize) * args.bandSize;

  for (let lo = bandStart; lo <= maxRating; lo += args.bandSize) {
    const hi = lo + args.bandSize;
    const rows = sampleBand.all(lo, hi, args.capPerBand);
    if (!rows.length) continue;

    insertBatch(rows.map((r) => [
      r.puzzle_id, r.fen, r.moves, r.rating, r.rating_deviation,
      r.popularity, r.nb_plays, r.themes, r.opening_tags,
    ]));

    totalKept += rows.length;
    console.log(`  band ${lo}-${hi - 1}: kept ${rows.length.toLocaleString()}`);
  }

  source.close();

  console.log(`\ntotal sampled: ${totalKept.toLocaleString()}`);
  console.log("sorting into final table by rating...");
  target.exec(`
    INSERT INTO puzzles
      (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags)
    SELECT puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags
    FROM puzzles_staging
    ORDER BY rating ASC, puzzle_id ASC;
  `);

  console.log("dropping staging table...");
  target.exec("DROP TABLE puzzles_staging;");

  console.log("building indexes...");
  target.exec(`
    CREATE UNIQUE INDEX idx_puzzles_puzzle_id ON puzzles(puzzle_id);
    CREATE INDEX idx_puzzles_rating ON puzzles(rating);
  `);

  console.log("analyzing...");
  target.exec("ANALYZE;");

  console.log("vacuuming...");
  target.pragma("journal_mode = DELETE");
  target.exec("VACUUM;");
  target.pragma("journal_mode = WAL");

  const stats = target
    .prepare("SELECT COUNT(*) AS count, MIN(rating) AS min, MAX(rating) AS max FROM puzzles")
    .get();
  target.close();

  const sizeMb = (fs.statSync(args.target).size / 1024 / 1024).toFixed(1);

  console.log("\n--- shrink complete ---");
  console.log(`rows        : ${stats.count.toLocaleString()}`);
  console.log(`rating range: ${stats.min} - ${stats.max}`);
  console.log(`file size   : ${sizeMb} MB`);
  console.log(`elapsed     : ${formatDuration(Date.now() - startedAt)}`);
}

main();
