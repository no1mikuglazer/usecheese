import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestApp, startTestServer } from "../support/test-app.js";
import { mockGetUser, fakeClerkUser } from "../support/clerk-user-mock.js";

describe("public users endpoints", () => {
  test("GET /api/users/profile-options returns the banner and opening catalogs", async () => {
    const { baseUrl, close } = await startTestServer(createTestApp());
    try {
      const res = await fetch(`${baseUrl}/api/users/profile-options`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(body.banners) && body.banners.length > 0);
      assert.ok(Array.isArray(body.openings) && body.openings.length > 0);
    } finally {
      await close();
    }
  });

  test("GET /api/users/:username 404s for an unknown username", async () => {
    const { baseUrl, close } = await startTestServer(createTestApp());
    try {
      const res = await fetch(`${baseUrl}/api/users/nobody_has_this_name`);
      assert.equal(res.status, 404);
    } finally {
      await close();
    }
  });

  test("GET /api/users/:username returns a full profile shape for an existing user", async (t) => {
    mockGetUser(t, async (id) => fakeClerkUser({ id, username: "alice_test" }));

    // Create the account the same way the real app does: an authenticated
    // /me call, which self-heals on first sight.
    const authed = await startTestServer(createTestApp({ userId: "user_alice" }));
    await fetch(`${authed.baseUrl}/api/users/me`);
    await authed.close();

    const pub = await startTestServer(createTestApp());
    try {
      const res = await fetch(`${pub.baseUrl}/api/users/alice_test`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.username, "alice_test");
      assert.equal(body.imageUrl, null);
      assert.equal(body.puzzleStats.rating, 200);
      assert.deepEqual(body.recentActivity, []);
      assert.deepEqual(body.ratingHistory, []);
      assert.deepEqual(body.themeBreakdown.weaknesses, []);
    } finally {
      await pub.close();
    }
  });

  test("a signed-in viewer's own not-yet-created profile self-heals on the public route", async (t) => {
    mockGetUser(t, async (id) => fakeClerkUser({ id, username: "self_heal_test" }));

    // No prior /me call — the public route itself must create the row when
    // the viewer is looking at their own username.
    const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_self_heal" }));
    try {
      const res = await fetch(`${baseUrl}/api/users/self_heal_test`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.username, "self_heal_test");
    } finally {
      await close();
    }
  });
});
