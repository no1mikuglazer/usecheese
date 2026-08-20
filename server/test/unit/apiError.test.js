import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../../src/lib/ApiError.js";

describe("ApiError", () => {
  test("badRequest sets status 400 and the given code/details", () => {
    const err = ApiError.badRequest("invalid_request", { field: "x" });
    assert.equal(err.status, 400);
    assert.equal(err.code, "invalid_request");
    assert.deepEqual(err.details, { field: "x" });
    assert.ok(err instanceof Error);
  });

  test("notFound sets status 404", () => {
    assert.equal(ApiError.notFound("puzzle_not_found").status, 404);
  });

  test("unauthorized sets status 401", () => {
    assert.equal(ApiError.unauthorized("authentication_required").status, 401);
  });

  test("message is the code and name is ApiError", () => {
    const err = ApiError.notFound("puzzle_not_found");
    assert.equal(err.message, "puzzle_not_found");
    assert.equal(err.name, "ApiError");
  });

  test("details is left undefined when not provided", () => {
    const err = ApiError.badRequest("invalid_request");
    assert.equal(err.details, undefined);
  });
});
