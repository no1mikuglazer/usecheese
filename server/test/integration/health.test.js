import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApp, startTestServer } from "../support/test-app.js";

test("GET /api/health returns 200 ok when the database is reachable", async () => {
  const { baseUrl, close } = await startTestServer(createTestApp());
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.db, "ok");
    assert.equal(typeof body.uptimeSeconds, "number");
  } finally {
    await close();
  }
});
