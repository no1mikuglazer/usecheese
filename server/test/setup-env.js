/* --import preload for the test suite.
 *
 * config.js reads process.env at import time (top-level dotenv.config() +
 * `const config = {...}`), so every env var it depends on must be set
 * before anything imports config.js — that's what `node --import
 * ./test/setup-env.js --test ...` guarantees: this module fully evaluates
 * before any test file's own imports resolve.
 *
 * node --test runs each test file in its own OS process, so USERS_DB_PATH
 * below gets a fresh temp file per file for free — no cross-file
 * interference between tests that write to the users DB.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "http://localhost:5500";

// Fake-shaped-but-invalid dev keys — enough for @clerk/express's real code
// paths to run without a network call. Verified directly against the
// installed @clerk/express version: a signed-out request correctly resolves
// to no userId, and a request with a branded req.auth (see
// test/support/test-app.js) is recognized without any real verification.
process.env.CLERK_PUBLISHABLE_KEY = "pk_test_ZmFrZS1kb21haW4uY2xlcmsuYWNjb3VudHMuZGV2JA";
process.env.CLERK_SECRET_KEY = "sk_test_0000000000000000000000000000000000000000000000";
process.env.CLERK_TELEMETRY_DISABLED = "1";

// The puzzle DB requires a real pre-existing file (getDb() has
// fileMustExist: true) — built by the `pretest` script from
// test/fixtures/puzzles-fixture-data.js before the suite runs.
process.env.DB_PATH = path.join(serverRoot, "test", "fixtures", "puzzles-fixture.sqlite");

// The users DB self-creates its schema on any fresh path, so each process
// just gets its own empty temp file.
const usersDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cheese-test-users-db-"));
process.env.USERS_DB_PATH = path.join(usersDbDir, "cheese-users.sqlite");
