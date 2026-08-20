/* Test-only helpers for building an app instance and faking a signed-in
 * Clerk session, with zero changes to production code.
 *
 * getAuth(req) (from @clerk/express) just checks that req.auth is a
 * function branded with the public, standard
 * Symbol.for("@clerk/express.auth") key, and Clerk's own middleware skips
 * its real verification once that brand is already present. Verified
 * directly against the installed @clerk/express version — see
 * clerk-auth-canary.test.js, which guards this against a future upgrade
 * silently changing the contract.
 *
 * tokenType must be exactly "session_token" or @clerk/backend treats the
 * auth object as signed-out.
 *
 * createApp() (src/app.js) builds and returns a fully wired Express app in
 * one call, with clerkMiddleware() already mounted before the routers —
 * there is no seam to inject a middleware ahead of it from outside. Instead
 * the branding middleware is mounted on a thin wrapper app, and the real
 * app is mounted under it as a sub-app: Express dispatches the wrapper's
 * own middleware first, so req.auth is already branded by the time the
 * inner app's clerkMiddleware() runs.
 */

import express from "express";
import { createApp } from "../../src/app.js";

const CLERK_AUTH_BRAND = Symbol.for("@clerk/express.auth");

export function fakeAuthMiddleware(userId) {
  return (req, res, next) => {
    const auth = () => ({ userId, sessionId: "sess_fake", tokenType: "session_token" });
    auth[CLERK_AUTH_BRAND] = true;
    req.auth = auth;
    next();
  };
}

export function createTestApp({ userId } = {}) {
  if (!userId) return createApp();

  const wrapper = express();
  wrapper.use(fakeAuthMiddleware(userId));
  wrapper.use(createApp());
  return wrapper;
}

export async function startTestServer(app) {
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0);
    s.once("listening", () => resolve(s));
    s.once("error", reject);
  });

  const { port } = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
