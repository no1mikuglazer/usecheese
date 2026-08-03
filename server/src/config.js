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

// Resolve relative DB paths against server/, not the process CWD, so `npm run
// dev` and `node src/index.js` behave identically regardless of where they're
// launched from.
function resolveDbPath(value) {
  const raw = value || "./data/cheese.sqlite";
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
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3001,
  dbPath: resolveDbPath(process.env.DB_PATH),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
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
