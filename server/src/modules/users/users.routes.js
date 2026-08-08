/* User routes. Every route here requires a valid Clerk session. */

import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import * as controller from "./users.controller.js";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, asyncHandler(controller.me));
