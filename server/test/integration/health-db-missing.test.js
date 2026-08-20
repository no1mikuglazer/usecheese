/* config.js reads DB_PATH at import time, so overriding it for just this
 * file (without touching the shared fixture DB other tests read) needs a
 * dynamic import() *after* the override — a static `import` would be
 * hoisted and run before this file's own top-level code, same as every
 * other file in this suite. Each node --test file is its own process, so
 * this override can't leak into any other test file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/health returns 503 when the database file is missing", async () => {
  process.env.DB_PATH = "/definitely/does/not/exist/cheese.sqlite";
  const { createTestApp, startTestServer } = await import("../support/test-app.js");

  const { baseUrl, close } = await startTestServer(createTestApp());
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.status, "error");
    assert.equal(body.db, "unreachable");
  } finally {
    await close();
  }
});
