/* Cheese server — SQLite connection.
 *
 * One process-wide connection. better-sqlite3 is synchronous by design: an
 * indexed lookup finishes in well under a millisecond, so blocking the event
 * loop for the duration of a query is cheaper than the overhead of making it
 * async.
 */

import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "../config.js";

let db = null;

export function getDb() {
  if (db) return db;

  if (!fs.existsSync(config.dbPath)) {
    // Quote the path so any stray whitespace in DB_PATH is visible rather than
    // silently reformatting the message.
    throw new Error(
      `SQLite database not found at ${JSON.stringify(config.dbPath)}. ` +
        `Run the puzzle import first — see server/README.md.`,
    );
  }

  db = new Database(config.dbPath, { readonly: false, fileMustExist: true });

  // WAL keeps readers from blocking on a writer; the puzzles table is
  // read-only after import, but future features will write.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
