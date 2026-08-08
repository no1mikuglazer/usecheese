/* Cheese server — configuration.
 *
 * All environment-specific values live here, read from environment variables.
 * Real values come from `.env` locally (gitignored) or from the host's
 * dashboard in production — never from committed source. See `.env.example`
 * for the list of keys.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

// Always trim. Values pasted into a hosting dashboard routinely pick up a
// trailing newline or stray space, and an untrimmed path fails in a way that
// looks nothing like whitespace: the file is plainly there in the directory
// listing, yet every existence check for it misses, because the name being
// looked up ends in "\n".
function readEnv(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

// Resolve relative DB paths against server/, not the process CWD, so `npm run
// dev` and `node src/index.js` behave identically regardless of where they're
// launched from.
function resolveDbPath(value, defaultRelative) {
  const raw = value || defaultRelative;
  return path.isAbsolute(raw) ? raw : path.resolve(serverRoot, raw);
}

function parseOrigins(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const config = {
  env: readEnv("NODE_ENV") || "development",
  port: Number(readEnv("PORT")) || 3001,
  dbPath: resolveDbPath(readEnv("DB_PATH"), "./data/cheese.sqlite"),
  // Deliberately a SEPARATE file from dbPath, never a table alongside the
  // puzzles — import-puzzles.js and shrink-database.js both drop/recreate
  // their target file as documented, routine operations. If accounts lived
  // there too, running either would silently destroy every user. See
  // "Why the user database is a separate file" in README.md.
  usersDbPath: resolveDbPath(readEnv("USERS_DB_PATH"), "./data/cheese-users.sqlite"),
  corsOrigins: parseOrigins(readEnv("CORS_ORIGINS")),
  // Read (and trimmed, like everything else here) through config rather than
  // left for @clerk/express to pull raw from process.env — clerkMiddleware()
  // is mounted with no explicit options below, so it reads these same two
  // env var names itself; this is only for the fail-fast check.
  clerkSecretKey: readEnv("CLERK_SECRET_KEY"),
  clerkPublishableKey: readEnv("CLERK_PUBLISHABLE_KEY"),
  serverRoot,
};

config.isProduction = config.env === "production";

// Fail fast on a misconfigured production deploy rather than silently serving
// with a wide-open CORS policy.
if (config.isProduction && config.corsOrigins.length === 0) {
  throw new Error(
    "CORS_ORIGINS must be set in production (comma-separated list of allowed frontend origins)",
  );
}

if (config.isProduction && (!config.clerkSecretKey || !config.clerkPublishableKey)) {
  throw new Error(
    "CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY must both be set in production",
  );
}
