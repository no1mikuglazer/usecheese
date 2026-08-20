import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  puzzleResultBodySchema,
  usernameParamSchema,
  profileUpdateBodySchema,
} from "../../src/modules/users/users.schema.js";

describe("puzzleResultBodySchema", () => {
  test("accepts a valid puzzle result body", () => {
    const result = puzzleResultBodySchema.safeParse({ puzzleId: "0000A", failed: false, usedHint: false });
    assert.equal(result.success, true);
  });

  test("rejects a malformed puzzleId", () => {
    assert.equal(
      puzzleResultBodySchema.safeParse({ puzzleId: "!!", failed: false, usedHint: false }).success,
      false,
    );
  });

  test("rejects a missing failed/usedHint flag", () => {
    assert.equal(
      puzzleResultBodySchema.safeParse({ puzzleId: "0000A", failed: false }).success,
      false,
    );
  });
});

describe("usernameParamSchema", () => {
  test("accepts a non-empty username up to 64 characters", () => {
    assert.equal(usernameParamSchema.safeParse({ username: "a".repeat(64) }).success, true);
  });

  test("rejects an empty username", () => {
    assert.equal(usernameParamSchema.safeParse({ username: "" }).success, false);
  });

  test("rejects a username over 64 characters", () => {
    assert.equal(usernameParamSchema.safeParse({ username: "a".repeat(65) }).success, false);
  });
});

describe("profileUpdateBodySchema", () => {
  test("accepts a single field", () => {
    assert.equal(profileUpdateBodySchema.safeParse({ banner: "red" }).success, true);
  });

  test("rejects an empty body", () => {
    assert.equal(profileUpdateBodySchema.safeParse({}).success, false);
  });

  test("accepts favoriteOpening explicitly set to null", () => {
    assert.equal(profileUpdateBodySchema.safeParse({ favoriteOpening: null }).success, true);
  });
});
