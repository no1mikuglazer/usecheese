/* Puzzle routes.
 *
 * `/random` is declared before `/:id` so the literal path is not swallowed by
 * the parameter route.
 */

import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  randomPuzzleQuerySchema,
  puzzleIdParamSchema,
} from "./puzzles.schema.js";
import * as controller from "./puzzles.controller.js";

export const puzzlesRouter = Router();

puzzlesRouter.get("/stats", controller.puzzleStats);

puzzlesRouter.get(
  "/random",
  validate(randomPuzzleQuerySchema, "query"),
  controller.randomPuzzle,
);

puzzlesRouter.get(
  "/:id",
  validate(puzzleIdParamSchema, "params"),
  controller.puzzleById,
);
