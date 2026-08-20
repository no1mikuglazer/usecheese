import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestApp, startTestServer } from "../support/test-app.js";

describe("error handling", () => {
  let baseUrl;
  let close;

  before(async () => {
    ({ baseUrl, close } = await startTestServer(createTestApp()));
  });

  after(async () => {
    await close();
  });

  test("an unmatched route returns 404 route_not_found", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.deepEqual(body, { error: "route_not_found" });
  });

  test("a validation ApiError returns its own status/code, not a generic 500", async () => {
    const res = await fetch(`${baseUrl}/api/puzzles/a`);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_request");
    assert.ok(Array.isArray(body.details));
  });

  test("an unauthenticated request to a protected route gets a clean 401, no stack trace leaked", async () => {
    const res = await fetch(`${baseUrl}/api/users/me`);
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.deepEqual(body, { error: "authentication_required" });
  });
});
