/* Cheese server — user-account SQLite connection.
 *
 * A SEPARATE database and connection from db/connection.js, on purpose: that
 * one backs the puzzle table, which import-puzzles.js and shrink-database.js
 * both drop and rebuild as routine, documented operations. Accounts must
 * never be able to be destroyed by re-running a puzzle-data script, so they
 * live in their own file with their own connection — sharing either would
 * make that possible. See "Why the user database is a separate file" in
 * server/README.md.
 *
 * Unlike the puzzle DB (which requires an explicit import before the API can
 * start — there is no data to synthesize it from), this one has no external
 * source of truth: it IS the source of truth. So getUsersDb() creates the
 * file and schema on first connection if missing, rather than throwing.
 * scripts/init-users-db.js still exists as the explicit, loggable step for
 * preparing a fresh deployment volume — see that file for why it is
 * additionally safe to run again later.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";

let db = null;

function createSchema(database) {
  // IF NOT EXISTS everywhere: this runs on every connection, so it must
  // never be able to touch a row that already exists.
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      clerk_user_id       TEXT PRIMARY KEY,
      username             TEXT NOT NULL UNIQUE,
      username_changed_at  TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS puzzle_stats (
      clerk_user_id   TEXT PRIMARY KEY REFERENCES users(clerk_user_id),
      solved          INTEGER NOT NULL DEFAULT 0,
      attempted       INTEGER NOT NULL DEFAULT 0,
      best_streak     INTEGER NOT NULL DEFAULT 0,
      current_streak  INTEGER NOT NULL DEFAULT 0,
      last_solved_at  TEXT
    );
  `);
}

export function getUsersDb() {
  if (db) return db;

  // server/data/ is gitignored and untracked (see .gitignore), so a fresh
  // clone doesn't have it yet — better-sqlite3 does not create missing
  // parent directories itself, and unlike the puzzle DB there is no import
  // script guaranteed to have run first and created it as a side effect.
  fs.mkdirSync(path.dirname(config.usersDbPath), { recursive: true });

  db = new Database(config.usersDbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  createSchema(db);

  return db;
}

export function closeUsersDb() {
  if (db) {
    db.close();
    db = null;
  }
}
