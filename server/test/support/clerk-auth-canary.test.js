/* Smoke test guarding the Symbol.for("@clerk/express.auth") branding trick
 * that test-app.js's fakeAuthMiddleware relies on. If a future @clerk/express
 * upgrade changes this contract, this is the test that should fail first and
 * loudest, rather than every integration test failing with confusing 401s.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { fakeAuthMiddleware } from "./test-app.js";

test("a branded req.auth is recognized by the installed @clerk/express as a valid signed-in session", async () => {
  const app = express();
  app.use(fakeAuthMiddleware("user_canary"));
  app.use(clerkMiddleware());
  app.get("/probe", (req, res) => res.json(getAuth(req)));

  const server = app.listen(0);
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/probe`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.userId, "user_canary");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a request with no branded req.auth resolves to a signed-out session, not an error", async () => {
  const app = express();
  app.use(clerkMiddleware());
  app.get("/probe", (req, res) => {
    const auth = getAuth(req);
    res.json({ userId: auth.userId ?? null });
  });

  const server = app.listen(0);
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/probe`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.userId, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
