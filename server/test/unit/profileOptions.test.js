import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BANNERS, OPENINGS, BANNER_KEYS, OPENING_NAMES } from "../../src/lib/profileOptions.js";

describe("profileOptions", () => {
  test("BANNER_KEYS includes every current banner key plus the legacy ones", () => {
    for (const b of BANNERS) assert.ok(BANNER_KEYS.has(b.key));
    assert.ok(BANNER_KEYS.has("amber"));
    assert.ok(BANNER_KEYS.has("rose"));
  });

  test("legacy banner keys are not offered in the current BANNERS list", () => {
    assert.equal(BANNERS.some((b) => b.key === "amber" || b.key === "rose"), false);
  });

  test("OPENING_NAMES contains every opening name exactly once", () => {
    assert.equal(OPENING_NAMES.size, OPENINGS.length);
    for (const name of OPENINGS) assert.ok(OPENING_NAMES.has(name));
  });

  test("every BANNERS entry has a key and a label", () => {
    for (const b of BANNERS) {
      assert.equal(typeof b.key, "string");
      assert.equal(typeof b.label, "string");
    }
  });
});
