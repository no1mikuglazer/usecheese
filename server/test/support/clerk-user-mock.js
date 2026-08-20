/* Mocks the two real Clerk network calls users.service.js makes
 * (clerkClient.users.getUser / updateUser) with node:test's stable
 * t.mock.method() — no experimental flags. clerkClient is a shared live
 * object reference across every importer, so mocking its methods here
 * affects the same instance app code calls. node:test auto-restores
 * t.mock.method() mocks after the test that created them finishes.
 */

import { clerkClient } from "@clerk/express";

export function mockGetUser(t, impl) {
  return t.mock.method(clerkClient.users, "getUser", impl);
}

export function mockUpdateUser(t, impl) {
  return t.mock.method(clerkClient.users, "updateUser", impl);
}

// Shaped enough for users.service.js, which only ever reads username,
// hasImage, and imageUrl off a Clerk user object.
export function fakeClerkUser(overrides = {}) {
  return {
    id: "user_fake",
    username: "fakeuser",
    hasImage: false,
    imageUrl: "",
    ...overrides,
  };
}
