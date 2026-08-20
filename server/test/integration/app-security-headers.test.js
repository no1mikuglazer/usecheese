import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestApp, startTestServer } from "../support/test-app.js";

describe("security headers and CORS", () => {
  let baseUrl;
  let close;

  before(async () => {
    ({ baseUrl, close } = await startTestServer(createTestApp()));
  });

  after(async () => {
    await close();
  });

  test("Helmet sets baseline security headers", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.has("x-dns-prefetch-control"));
  });

  test("an allowed localhost origin is reflected in Access-Control-Allow-Origin (dev mode)", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "http://localhost:5500" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5500");
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  });

  test("a disallowed origin is not reflected in CORS headers", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://evil.example.com" },
    });
    assert.notEqual(res.headers.get("access-control-allow-origin"), "https://evil.example.com");
  });
});
