import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApp, startTestServer } from "../support/test-app.js";
import { mockGetUser, mockUpdateUser, fakeClerkUser } from "../support/clerk-user-mock.js";

function patchMe(baseUrl, payload) {
  return fetch(`${baseUrl}/api/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

test("GET /api/users/me requires authentication", async () => {
  const { baseUrl, close } = await startTestServer(createTestApp());
  try {
    const res = await fetch(`${baseUrl}/api/users/me`);
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test("GET /api/users/me creates the account on first sight with default stats", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "bob_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_bob" }));
  try {
    const res = await fetch(`${baseUrl}/api/users/me`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.username, "bob_test");
    assert.equal(body.puzzleStats.rating, 200);
    assert.equal(body.puzzleStats.solved, 0);
  } finally {
    await close();
  }
});

test("GET /api/users/me reuses the local row on a second call, without another Clerk lookup", async (t) => {
  const getUserMock = mockGetUser(t, async (id) => fakeClerkUser({ id, username: "carol_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_carol" }));
  try {
    await fetch(`${baseUrl}/api/users/me`);
    await fetch(`${baseUrl}/api/users/me`);
    assert.equal(getUserMock.mock.callCount(), 1);
  } finally {
    await close();
  }
});

test("PATCH /api/users/me updates the banner", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "dave_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_dave" }));
  try {
    const res = await patchMe(baseUrl, { banner: "blue" });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.banner, "blue");
  } finally {
    await close();
  }
});

test("PATCH /api/users/me rejects an invalid banner key", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "erin_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_erin" }));
  try {
    const res = await patchMe(baseUrl, { banner: "not-a-real-banner" });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_banner");
  } finally {
    await close();
  }
});

test("PATCH /api/users/me rejects an unrecognized opening", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "faith_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_faith" }));
  try {
    const res = await patchMe(baseUrl, { favoriteOpening: "Not A Real Opening" });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_opening");
  } finally {
    await close();
  }
});

test("PATCH /api/users/me changes the username via Clerk and enforces the 14-day cooldown", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "frank_test" }));
  const updateUserMock = mockUpdateUser(t, async () => ({}));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_frank" }));
  try {
    const first = await patchMe(baseUrl, { username: "frank_renamed" });
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstBody.username, "frank_renamed");
    assert.equal(updateUserMock.mock.callCount(), 1);

    const second = await patchMe(baseUrl, { username: "frank_again" });
    const secondBody = await second.json();
    assert.equal(second.status, 400);
    assert.equal(secondBody.error, "username_change_too_soon");
  } finally {
    await close();
  }
});

test("PATCH /api/users/me surfaces Clerk's own rejection message on a username update failure", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "grace_test" }));
  mockUpdateUser(t, async () => {
    throw { errors: [{ message: "that username is taken" }] };
  });
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_grace" }));
  try {
    const res = await patchMe(baseUrl, { username: "taken_name" });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "username_update_failed");
    assert.equal(body.details.message, "that username is taken");
  } finally {
    await close();
  }
});

test("PATCH /api/users/me with an empty body is rejected by schema validation", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "henry_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_henry" }));
  try {
    const res = await patchMe(baseUrl, {});
    assert.equal(res.status, 400);
  } finally {
    await close();
  }
});
