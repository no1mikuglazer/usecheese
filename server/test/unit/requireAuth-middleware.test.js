import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { requireAuth } from "../../src/middleware/requireAuth.js";

const CLERK_AUTH_BRAND = Symbol.for("@clerk/express.auth");

// clerkMiddleware() is mounted globally in app.js, so by the time requireAuth
// ever runs in this app, req.auth is always a branded function — either a
// real signed-in session or the real signed-out shape. That's the only
// realistic input; simulate both here.
function brandedAuth(userId) {
  const auth = () => ({ userId, sessionId: "sess_fake", tokenType: "session_token" });
  auth[CLERK_AUTH_BRAND] = true;
  return auth;
}

describe("requireAuth middleware", () => {
  test("calls next() with no error when the session carries a userId", () => {
    const req = { auth: brandedAuth("user_123") };
    let calledWith = "not-called";

    requireAuth(req, {}, (err) => {
      calledWith = err;
    });

    assert.equal(calledWith, undefined);
  });

  test("calls next(ApiError 401) when the session is signed out (no userId)", () => {
    const req = { auth: brandedAuth(undefined) };
    let calledWith;

    requireAuth(req, {}, (err) => {
      calledWith = err;
    });

    assert.equal(calledWith.status, 401);
    assert.equal(calledWith.code, "authentication_required");
  });
});
