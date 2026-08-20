import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomPuzzleQuerySchema, puzzleIdParamSchema } from "../../src/modules/puzzles/puzzles.schema.js";

describe("randomPuzzleQuerySchema", () => {
  test("applies the default 400-2800 band when no query is given", () => {
    const result = randomPuzzleQuerySchema.parse({});
    assert.deepEqual(result, { minRating: 400, maxRating: 2800 });
  });

  test("coerces string query params to numbers", () => {
    const result = randomPuzzleQuerySchema.parse({ minRating: "500", maxRating: "600" });
    assert.deepEqual(result, { minRating: 500, maxRating: 600 });
  });

  test("rejects minRating greater than maxRating", () => {
    const result = randomPuzzleQuerySchema.safeParse({ minRating: 2000, maxRating: 1000 });
    assert.equal(result.success, false);
  });

  test("rejects a rating outside 0-3500", () => {
    assert.equal(randomPuzzleQuerySchema.safeParse({ minRating: -1 }).success, false);
    assert.equal(randomPuzzleQuerySchema.safeParse({ maxRating: 3501 }).success, false);
  });
});

describe("puzzleIdParamSchema", () => {
  test("accepts a 4-8 character alphanumeric id", () => {
    assert.equal(puzzleIdParamSchema.safeParse({ id: "00008" }).success, true);
  });

  test("rejects ids shorter than 4 or longer than 8 characters", () => {
    assert.equal(puzzleIdParamSchema.safeParse({ id: "abc" }).success, false);
    assert.equal(puzzleIdParamSchema.safeParse({ id: "abcdefghi" }).success, false);
  });

  test("rejects non-alphanumeric characters", () => {
    assert.equal(puzzleIdParamSchema.safeParse({ id: "ab-de" }).success, false);
  });
});
