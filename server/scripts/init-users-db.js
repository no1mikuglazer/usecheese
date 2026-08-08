/* Explicit, loggable setup step for the user-accounts database, for use when
 * preparing a fresh deployment volume — mirrors why import-puzzles.js and
 * shrink-database.js exist as their own commands rather than running
 * implicitly on first request.
 *
 * UNLIKE those two scripts, this one is deliberately NON-destructive: it
 * never drops a table, only `CREATE TABLE IF NOT EXISTS`. The puzzle scripts
 * rebuild-from-scratch safely because their data is fully derived from the
 * source parquet — there is nothing to lose. This database IS the source of
 * truth for accounts, so running it again (by habit, by muscle memory from
 * `import:puzzles`/`shrink:puzzles`, or by an automated deploy step) must
 * never be able to destroy a single user. If you are tempted to add a DROP
 * TABLE here for a schema change, write a migration instead.
 *
 * Usage:
 *   node scripts/init-users-db.js [--db <path>]
 *
 * The server itself (server/src/db/usersConnection.js) also runs this same
 * schema on every connection for the same reason — so a fresh local
 * checkout just works without a manual step. This script exists for the
 * cases where you want that step to be explicit and visible: setting up a
 * production volume, or confirming the schema in CI.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

function parseArgs(argv) {
  const args = {
    db: path.resolve(serverRoot, "data", "cheese-users.sqlite"),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--db":
        args.db = path.resolve(value);
        i += 1;
        break;
      case "--help":
        console.log("Usage: node scripts/init-users-db.js [--db <path>]");
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return args;
}

function createSchema(db) {
  db.exec(`
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
      last_solved_at  TEXT,
      rating          INTEGER NOT NULL DEFAULT 200
    );

    -- See src/db/usersConnection.js's identical table for why: pure data
    -- collection ahead of a future stats/improvement-areas feature, nothing
    -- reads it yet.
    CREATE TABLE IF NOT EXISTS puzzle_attempts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id  TEXT NOT NULL REFERENCES users(clerk_user_id),
      puzzle_id      TEXT NOT NULL,
      puzzle_rating  INTEGER NOT NULL,
      themes         TEXT,
      failed         INTEGER NOT NULL,
      used_hint      INTEGER NOT NULL,
      rating_delta   INTEGER NOT NULL,
      attempted_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user ON puzzle_attempts(clerk_user_id);
  `);

  // See src/db/usersConnection.js's identical guard for why: SQLite has no
  // "ADD COLUMN IF NOT EXISTS", so a database that predates `rating` needs
  // this explicit, idempotent ALTER TABLE instead.
  const hasRatingColumn = db
    .prepare("PRAGMA table_info(puzzle_stats)")
    .all()
    .some((column) => column.name === "rating");

  if (!hasRatingColumn) {
    db.exec("ALTER TABLE puzzle_stats ADD COLUMN rating INTEGER NOT NULL DEFAULT 200");
  }
}

function main() {
  const args = parseArgs(process.argv);

  console.log(`target: ${args.db}\n`);

  const alreadyExisted = fs.existsSync(args.db);
  fs.mkdirSync(path.dirname(args.db), { recursive: true });

  const db = new Database(args.db);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  createSchema(db);

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  db.close();

  console.log(alreadyExisted ? "database already existed — schema confirmed, nothing dropped" : "database created");
  console.log(`users table: ${userCount.toLocaleString()} row(s)`);
}

main();
