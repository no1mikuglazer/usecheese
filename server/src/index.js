/* Cheese server — entrypoint. */

import { config } from "./config.js";
import { createApp } from "./app.js";
import { getDb, closeDb } from "./db/connection.js";
import { getPuzzleCount } from "./modules/puzzles/puzzles.service.js";

const DB_WAIT_ATTEMPTS = 15;
const DB_WAIT_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// On some hosts the volume holding the database is bind-mounted into the
// container slightly after the app process starts, so the very first check
// can race a mount that is still in progress (observed on Railway: the app's
// own startup can run before its "Mounting volume on: ..." log line). Retry
// briefly before treating a missing file as fatal, rather than failing on
// what is often just a one-second timing gap.
async function openDatabaseWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= DB_WAIT_ATTEMPTS; attempt += 1) {
    try {
      return getDb();
    } catch (err) {
      lastError = err;
      if (attempt < DB_WAIT_ATTEMPTS) {
        console.log(`[db] not ready yet (attempt ${attempt}/${DB_WAIT_ATTEMPTS}), retrying...`);
        await sleep(DB_WAIT_DELAY_MS);
      }
    }
  }
  throw lastError;
}

async function start() {
  // Open the database up front so a missing/broken file fails loudly at boot
  // rather than on the first request.
  try {
    await openDatabaseWithRetry();
    console.log(`[db] ${config.dbPath} (${getPuzzleCount().toLocaleString()} puzzles)`);
  } catch (err) {
    console.error(`[db] failed to open database: ${err.message}`);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port} (${config.env})`);
    console.log(
      `[cors]   ${config.corsOrigins.length ? config.corsOrigins.join(", ") : "none configured"}` +
        `${config.isProduction ? "" : " (+ any localhost port in development)"}`,
    );
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      console.log(`\n[server] ${signal} received, shutting down`);
      server.close(() => {
        closeDb();
        process.exit(0);
      });
    });
  }
}

start();
