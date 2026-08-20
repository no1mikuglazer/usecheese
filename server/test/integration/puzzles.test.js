import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestApp, startTestServer } from "../support/test-app.js";
import { PUZZLES, PUZZLE_COUNT, EMPTY_BAND } from "../fixtures/puzzles-fixture-data.js";

describe("puzzles endpoints", () => {
  let baseUrl;
  let close;

  before(async () => {
    ({ baseUrl, close } = await startTestServer(createTestApp()));
  });

  after(async () => {
    await close();
  });

  test("GET /api/puzzles/stats returns the total fixture puzzle count", async () => {
    const res = await fetch(`${baseUrl}/api/puzzles/stats`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.count, PUZZLE_COUNT);
  });

  test("GET /api/puzzles/random returns a puzzle within the default 400-2800 band", async () => {
    const res = await fetch(`${baseUrl}/api/puzzles/random`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.rating >= 400 && body.rating <= 2800);
    assert.ok(Array.isArray(body.moves) && body.moves.length > 0);
    assert.ok(Array.isArray(body.themes));
  });

  test("GET /api/puzzles/random honors a narrow custom rating band", async () => {
    const res = await fetch(`${baseUrl}/api/puzzles/random?minRating=1000&maxRating=1000`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.rating, 1000);
  });

  test("GET /api/puzzles/random 400s when minRating exceeds maxRating", async () => {
    const res = await fetch(`${baseUrl}/api/puzzles/random?minRating=2000&maxRating=1000`);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_request");
  });

  test("GET /api/puzzles/random 404s for a rating band with no puzzles", async () => {
    const res = await fetch(
      `${baseUrl}/api/puzzles/random?minRating=${EMPTY_BAND.minRating}&maxRating=${EMPTY_BAND.maxRating}`,
    );
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error, "no_puzzles_in_range");
  });

  test("GET /api/puzzles/:id returns the puzzle by its Lichess id", async () => {
    const target = PUZZLES[0];
    const res = await fetch(`${baseUrl}/api/puzzles/${target.puzzleId}`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.id, target.puzzleId);
    assert.equal(body.rating, target.rating);
    assert.deepEqual(body.moves, target.moves);
    assert.deepEqual(body.themes, target.themes);
  });

  test("GET /api/puzzles/:id 404s for a well-formed but unknown id", async () => {
    const res = await fetch(`${baseUrl}/api/puzzles/zzzz`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error, "puzzle_not_found");
  });

  test("GET /api/puzzles/:id 400s for a malformed id", async () => {
    const res = await fetch(`${baseUrl}/api/puzzles/a`);
    assert.equal(res.status, 400);
  });
});
