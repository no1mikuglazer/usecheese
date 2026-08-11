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

// SQLite has no "ADD COLUMN IF NOT EXISTS" — a database that already existed
// before a given column was added needs a guarded ALTER TABLE instead. Runs
// on every connection, same as the CREATE TABLE statements below, so a
// production database self-heals without a separate manual migration step.
// Extracted once here since Stage 5 adds three more columns needing the
// exact same guard `rating` already established.
function ensureColumn(database, table, column, ddl) {
  const hasColumn = database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);

  if (!hasColumn) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function createSchema(database) {
  // IF NOT EXISTS everywhere: this runs on every connection, so it must
  // never be able to touch a row that already exists.
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      clerk_user_id       TEXT PRIMARY KEY,
      username             TEXT NOT NULL UNIQUE,
      username_changed_at  TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      banner                TEXT,
      favorite_opening      TEXT
    );

    CREATE TABLE IF NOT EXISTS puzzle_stats (
      clerk_user_id   TEXT PRIMARY KEY REFERENCES users(clerk_user_id),
      solved          INTEGER NOT NULL DEFAULT 0,
      attempted       INTEGER NOT NULL DEFAULT 0,
      best_streak     INTEGER NOT NULL DEFAULT 0,
      current_streak  INTEGER NOT NULL DEFAULT 0,
      last_solved_at  TEXT,
      rating          INTEGER NOT NULL DEFAULT 200
    );

    -- One row per completed puzzle attempt. Powers the profile page's
    -- recent-activity list, rating chart (rating_after), and
    -- strengths/weaknesses breakdown (themes) — see users.service.js.
    CREATE TABLE IF NOT EXISTS puzzle_attempts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id  TEXT NOT NULL REFERENCES users(clerk_user_id),
      puzzle_id      TEXT NOT NULL,
      puzzle_rating  INTEGER NOT NULL,
      themes         TEXT,
      failed         INTEGER NOT NULL,
      used_hint      INTEGER NOT NULL,
      rating_delta   INTEGER NOT NULL,
      attempted_at   TEXT NOT NULL DEFAULT (datetime('now')),
      rating_after   INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user ON puzzle_attempts(clerk_user_id);
  `);

  ensureColumn(database, "puzzle_stats", "rating", "rating INTEGER NOT NULL DEFAULT 200");
  ensureColumn(database, "users", "banner", "banner TEXT");
  ensureColumn(database, "users", "favorite_opening", "favorite_opening TEXT");
  ensureColumn(database, "puzzle_attempts", "rating_after", "rating_after INTEGER");
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
