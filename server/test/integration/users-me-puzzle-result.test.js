import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApp, startTestServer } from "../support/test-app.js";
import { mockGetUser, fakeClerkUser } from "../support/clerk-user-mock.js";
import { computeRatingDelta } from "../../src/lib/puzzleRating.js";
import { PUZZLES } from "../fixtures/puzzles-fixture-data.js";

const MID_PUZZLE = PUZZLES.find((p) => p.rating === 1000);
const FLOOR_PUZZLE = PUZZLES.find((p) => p.rating === 0);

function submitResult(baseUrl, puzzleId, { failed = false, usedHint = false } = {}) {
  return fetch(`${baseUrl}/api/users/me/puzzle-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId, failed, usedHint }),
  });
}

test("a correct solve applies the puzzle's own rating-based reward", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "iris_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_iris" }));
  try {
    const res = await submitResult(baseUrl, MID_PUZZLE.puzzleId);
    const body = await res.json();
    const expectedDelta = computeRatingDelta(MID_PUZZLE.rating, true);
    assert.equal(res.status, 200);
    assert.equal(body.delta, expectedDelta);
    assert.equal(body.puzzleStats.rating, 200 + expectedDelta);
    assert.equal(body.puzzleStats.solved, 1);
    assert.equal(body.puzzleStats.currentStreak, 1);
  } finally {
    await close();
  }
});

test("a hinted solve counts as incorrect and applies the penalty, not the reward", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "jack_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_jack" }));
  try {
    const res = await submitResult(baseUrl, MID_PUZZLE.puzzleId, { usedHint: true });
    const body = await res.json();
    const expectedDelta = computeRatingDelta(MID_PUZZLE.rating, false);
    assert.equal(body.delta, expectedDelta);
    assert.ok(expectedDelta < 0);
    assert.equal(body.puzzleStats.currentStreak, 0);
  } finally {
    await close();
  }
});

test("rating never drops below zero even after repeated failures", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "kate_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_kate" }));
  try {
    let lastBody;
    // Starting rating is 200; the floor puzzle's penalty is -20, so this
    // reaches zero well before 12 failures and stays clamped there.
    for (let i = 0; i < 12; i += 1) {
      const res = await submitResult(baseUrl, FLOOR_PUZZLE.puzzleId, { failed: true });
      lastBody = await res.json();
    }
    assert.ok(lastBody.puzzleStats.rating >= 0);
  } finally {
    await close();
  }
});

test("best streak tracks the highest current streak reached, not just the latest", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "leo_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_leo" }));
  try {
    await submitResult(baseUrl, MID_PUZZLE.puzzleId);
    await submitResult(baseUrl, MID_PUZZLE.puzzleId);
    await submitResult(baseUrl, MID_PUZZLE.puzzleId); // streak of 3
    await submitResult(baseUrl, MID_PUZZLE.puzzleId, { failed: true }); // resets current streak
    const finalRes = await submitResult(baseUrl, MID_PUZZLE.puzzleId); // streak of 1 again
    const finalBody = await finalRes.json();
    assert.equal(finalBody.puzzleStats.bestStreak, 3);
    assert.equal(finalBody.puzzleStats.currentStreak, 1);
  } finally {
    await close();
  }
});

test("POST /api/users/me/puzzle-result 404s for an unknown puzzle id", async (t) => {
  mockGetUser(t, async (id) => fakeClerkUser({ id, username: "mia_test" }));
  const { baseUrl, close } = await startTestServer(createTestApp({ userId: "user_mia" }));
  try {
    const res = await submitResult(baseUrl, "zzzz");
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

test("POST /api/users/me/puzzle-result requires authentication", async () => {
  const { baseUrl, close } = await startTestServer(createTestApp());
  try {
    const res = await submitResult(baseUrl, MID_PUZZLE.puzzleId);
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});
