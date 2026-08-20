import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeRatingDelta } from "../../src/lib/puzzleRating.js";

describe("computeRatingDelta", () => {
  test("reward at the floor rating (400) is the minimum reward (2)", () => {
    assert.equal(computeRatingDelta(400, true), 2);
  });

  test("reward at the ceiling rating (3300) is the maximum reward (40)", () => {
    assert.equal(computeRatingDelta(3300, true), 40);
  });

  test("reward at the midpoint rating (1850) interpolates linearly", () => {
    // t = 0.5 -> round(2 + 0.5 * 38) = 21
    assert.equal(computeRatingDelta(1850, true), 21);
  });

  test("penalty magnitude at the floor rating (400) is the maximum penalty (20)", () => {
    assert.equal(computeRatingDelta(400, false), -20);
  });

  test("penalty magnitude at the ceiling rating (3300) is the minimum penalty (3)", () => {
    assert.equal(computeRatingDelta(3300, false), -3);
  });

  test("penalty magnitude at the midpoint rating (1850) interpolates linearly", () => {
    // t = 0.5 -> -round(20 - 0.5 * 17) = -12
    assert.equal(computeRatingDelta(1850, false), -12);
  });

  test("ratings below the floor clamp to the floor's reward/penalty", () => {
    assert.equal(computeRatingDelta(0, true), 2);
    assert.equal(computeRatingDelta(0, false), -20);
    assert.equal(computeRatingDelta(-500, true), 2);
  });

  test("ratings above the ceiling clamp to the ceiling's reward/penalty", () => {
    assert.equal(computeRatingDelta(5000, true), 40);
    assert.equal(computeRatingDelta(5000, false), -3);
  });

  test("harder puzzles reward more and punish less than easier ones", () => {
    const easyReward = computeRatingDelta(500, true);
    const hardReward = computeRatingDelta(3000, true);
    const easyPenalty = computeRatingDelta(500, false);
    const hardPenalty = computeRatingDelta(3000, false);
    assert.ok(hardReward > easyReward);
    assert.ok(Math.abs(hardPenalty) < Math.abs(easyPenalty));
  });
});
