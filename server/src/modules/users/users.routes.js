/* User routes. `/me`, `/me/puzzle-result`, and the PATCH require a valid
 * Clerk session; `/profile-options` and `/:username` are public — anyone
 * can view a profile, matching the Stage 5 decision to make profiles
 * public by default.
 *
 * `/:username` is declared LAST, after every literal path (`/me`,
 * `/profile-options`) — same reasoning as `/random` before `/:id` in
 * puzzles.routes.js. Declared first, it would swallow those as a lookup
 * for a user literally named "me" or "profile-options".
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import { userMutationRateLimiter } from "../../middleware/rateLimiter.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import {
  puzzleResultBodySchema,
  usernameParamSchema,
  profileUpdateBodySchema,
} from "./users.schema.js";
import * as controller from "./users.controller.js";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, asyncHandler(controller.me));

usersRouter.patch(
  "/me",
  requireAuth,
  userMutationRateLimiter,
  validate(profileUpdateBodySchema, "body"),
  asyncHandler(controller.updateProfile),
);

usersRouter.post(
  "/me/puzzle-result",
  requireAuth,
  userMutationRateLimiter,
  validate(puzzleResultBodySchema, "body"),
  asyncHandler(controller.submitPuzzleResult),
);

usersRouter.get("/profile-options", controller.profileOptions);

usersRouter.get(
  "/:username",
  validate(usernameParamSchema, "params"),
  asyncHandler(controller.publicProfile),
);
