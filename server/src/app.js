/* Cheese server — Express application.
 *
 * Feature modules live under src/modules/<feature>/ and are mounted here.
 * Adding a future feature (accounts, cloud saves) means a new module folder
 * and one more `app.use` line — the shape below is what keeps that additive.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";

import { config } from "./config.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { puzzlesRouter } from "./modules/puzzles/puzzles.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

// Allow the configured production origins; in development also allow any
// localhost port, so whichever static server serves the frontend works
// without editing config each time.
function isAllowedOrigin(origin) {
  if (config.corsOrigins.includes(origin)) return true;
  if (config.isProduction) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // hosts sit behind a proxy; needed for rate-limit IPs
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, health probes, same-origin)
        // are not cross-origin and are not the CORS layer's concern.
        if (!origin) return callback(null, true);
        callback(null, isAllowedOrigin(origin));
      },
      // Clerk's session lives in a cookie. Without this, the browser never
      // sends it on the cross-subdomain request from usecheese.xyz to
      // api.usecheese.xyz, and every request looks signed-out regardless of
      // origin being allowed above — the two checks are independent.
      // `origin: '*'` cannot be combined with credentials by spec; the
      // per-request callback above already reflects a specific origin, so
      // this is compatible.
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  // Reads the session cookie/header on every request and attaches the
  // result for getAuth(req) to read — a no-op for routes that never call
  // it. No explicit keys passed: relies on CLERK_SECRET_KEY /
  // CLERK_PUBLISHABLE_KEY being set in the environment (see config.js's
  // fail-fast check, and .env.example for why they're read there too).
  app.use(clerkMiddleware());

  app.use("/api", apiRateLimiter);
  app.use("/api/health", healthRouter);
  app.use("/api/puzzles", puzzlesRouter);
  app.use("/api/users", usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
