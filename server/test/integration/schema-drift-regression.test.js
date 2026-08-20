/* scripts/init-users-db.js keeps a deliberate COPY of usersConnection.js's
 * schema rather than importing it (see that script's own header for why),
 * which already drifted out of sync once: idx_puzzle_attempts_user_time was
 * added to usersConnection.js and missed in the script's copy. This test is
 * the automated version of the manual check that caught that bug — it runs
 * the script for real and diffs its resulting schema against the live
 * getUsersDb() connection's schema, so that exact class of drift can't
 * silently recur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "../..");
const initScript = path.join(serverRoot, "scripts", "init-users-db.js");

function schemaOf(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name)
    .sort();

  const schema = {};
  for (const table of tables) {
    schema[table] = {
      columns: db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => `${c.name}:${c.type}:${c.notnull}:${c.dflt_value}`)
        .sort(),
      indexes: db
        .prepare(`PRAGMA index_list(${table})`)
        .all()
        .map((i) => i.name)
        .sort(),
    };
  }
  db.close();
  return schema;
}

test("init-users-db.js produces the exact same schema as the live getUsersDb() connection", async () => {
  const scriptDbPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "cheese-schema-check-")),
    "init.sqlite",
  );
  execFileSync(process.execPath, [initScript, "--db", scriptDbPath]);
  const scriptSchema = schemaOf(scriptDbPath);

  const { getUsersDb } = await import("../../src/db/usersConnection.js");
  const { config } = await import("../../src/config.js");
  getUsersDb(); // ensures the schema is actually created at config.usersDbPath
  const liveSchema = schemaOf(config.usersDbPath);

  assert.deepEqual(scriptSchema, liveSchema);
});
