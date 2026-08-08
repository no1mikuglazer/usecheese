/* User routes. Every route here requires a valid Clerk session. */

import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { puzzleResultBodySchema } from "./users.schema.js";
import * as controller from "./users.controller.js";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, asyncHandler(controller.me));

usersRouter.post(
  "/me/puzzle-result",
  requireAuth,
  validate(puzzleResultBodySchema, "body"),
  asyncHandler(controller.submitPuzzleResult),
);
