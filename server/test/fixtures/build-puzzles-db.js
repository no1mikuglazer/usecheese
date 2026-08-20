/* Builds the synthetic puzzles fixture DB the test suite runs against.
 *
 * getDb() (src/db/connection.js) requires a real pre-existing file
 * (fileMustExist: true) and there is no seed script for the real one — it
 * only exists via an 825MB parquet import, impractical for CI. Run via the
 * `pretest` npm script before `node --test`. Schema matches
 * scripts/import-puzzles.js exactly (moves/themes are space-separated
 * strings, not JSON).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { PUZZLES } from "./puzzles-fixture-data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(here, "puzzles-fixture.sqlite");

function build() {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE puzzles (
      id INTEGER PRIMARY KEY, puzzle_id TEXT NOT NULL, fen TEXT NOT NULL, moves TEXT NOT NULL,
      rating INTEGER NOT NULL, rating_deviation INTEGER NOT NULL, popularity INTEGER NOT NULL,
      nb_plays INTEGER NOT NULL, themes TEXT NOT NULL, opening_tags TEXT
    );
    CREATE UNIQUE INDEX idx_puzzles_puzzle_id ON puzzles(puzzle_id);
    CREATE INDEX idx_puzzles_rating ON puzzles(rating);
  `);

  const insert = db.prepare(`
    INSERT INTO puzzles
      (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, opening_tags)
    VALUES
      (@puzzleId, @fen, @moves, @rating, @ratingDeviation, @popularity, @nbPlays, @themes, @openingTags)
  `);

  const insertAll = db.transaction((rows) => {
    for (const row of rows) {
      insert.run({ ...row, moves: row.moves.join(" "), themes: row.themes.join(" ") });
    }
  });

  // Ordered by rating ASC on a single INSERT — matches the real invariant
  // (rowid monotonically correlated with rating) that puzzles.service.js's
  // random-lookup query depends on. PUZZLES is already built in ascending
  // rating order, but sort explicitly so that stays true even if the
  // fixture data is ever reordered.
  insertAll([...PUZZLES].sort((a, b) => a.rating - b.rating));

  db.close();

  console.log(`fixture puzzles db built at ${dbPath} (${PUZZLES.length} rows)`);
}

build();
