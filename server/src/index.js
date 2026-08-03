/* Cheese server — entrypoint. */

import { config } from "./config.js";
import { createApp } from "./app.js";
import { getDb, closeDb } from "./db/connection.js";
import { getPuzzleCount } from "./modules/puzzles/puzzles.service.js";

// Observed on Railway: re-attaching a volume to a fresh container can take
// noticeably longer than a typical mount race (several seconds, not one) —
// 15 attempts at 400ms (6s total) consistently wasn't enough. 45 attempts at
// 750ms gives a ~34s window, comfortably past what was observed.
const DB_WAIT_ATTEMPTS = 45;
const DB_WAIT_DELAY_MS = 750;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// On some hosts the volume holding the database is bind-mounted into the
// container some time after the app process starts, so an early check can
// race a mount that is still in progress. Retry for a while before treating a
// missing file as fatal, rather than failing on what is often just a
// several-second startup gap.
async function openDatabaseWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= DB_WAIT_ATTEMPTS; attempt += 1) {
    try {
      return getDb();
    } catch (err) {
      lastError = err;
      if (attempt < DB_WAIT_ATTEMPTS) {
        if (attempt === 1 || attempt % 5 === 0) {
          console.log(`[db] not ready yet (attempt ${attempt}/${DB_WAIT_ATTEMPTS}), retrying...`);
        }
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
