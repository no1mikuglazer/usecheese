/* Cheese server — entrypoint. */

import { config } from "./config.js";
import { createApp } from "./app.js";
import { getDb, closeDb } from "./db/connection.js";
import { getPuzzleCount } from "./modules/puzzles/puzzles.service.js";

function start() {
  // Open the database up front so a missing/broken file fails loudly at boot
  // rather than on the first request.
  try {
    getDb();
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
