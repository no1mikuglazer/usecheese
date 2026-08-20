import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { validate } from "../../src/middleware/validate.js";

describe("validate middleware", () => {
  test("calls next() with no error and attaches the parsed result to req.validated", () => {
    const schema = z.object({ id: z.string() });
    const req = { params: { id: "abc" } };
    let calledWith = "not-called";

    validate(schema, "params")(req, {}, (err) => {
      calledWith = err;
    });

    assert.equal(calledWith, undefined);
    assert.deepEqual(req.validated.params, { id: "abc" });
  });

  test("calls next(ApiError) with field/message details on validation failure", () => {
    const schema = z.object({ id: z.string() });
    const req = { query: {} };
    let calledWith;

    validate(schema, "query")(req, {}, (err) => {
      calledWith = err;
    });

    assert.equal(calledWith.status, 400);
    assert.equal(calledWith.code, "invalid_request");
    assert.ok(Array.isArray(calledWith.details));
    assert.equal(calledWith.details[0].field, "id");
  });

  test("defaults to validating req.query when no source is given", () => {
    const schema = z.object({ a: z.coerce.number() });
    const req = { query: { a: "5" } };

    validate(schema)(req, {}, () => {});

    assert.equal(req.validated.query.a, 5);
  });

  test("merges into an existing req.validated rather than overwriting other sources", () => {
    const schema = z.object({ id: z.string() });
    const req = { params: { id: "abc" }, validated: { query: { x: 1 } } };

    validate(schema, "params")(req, {}, () => {});

    assert.deepEqual(req.validated, { query: { x: 1 }, params: { id: "abc" } });
  });
});
