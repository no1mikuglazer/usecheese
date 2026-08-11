/* Request schemas for the users endpoints. */

import { z } from "zod";

export const puzzleResultBodySchema = z.object({
  // Same shape as puzzles.schema.js's puzzleIdParamSchema — Lichess puzzle
  // ids are short alphanumeric strings ("00008", "0000D").
  puzzleId: z
    .string()
    .regex(/^[A-Za-z0-9]{4,8}$/, "must be 4-8 alphanumeric characters"),
  failed: z.boolean(),
  usedHint: z.boolean(),
});

// Just shape-checked here — Clerk is the authority on username format and
// uniqueness (users.service.js's updateProfile calls it first and surfaces
// Clerk's own rejection message). Banner/opening are checked against
// profileOptions.js in the service, not here, since that's business data
// rather than request shape.
export const usernameParamSchema = z.object({
  username: z.string().min(1).max(64),
});

export const profileUpdateBodySchema = z
  .object({
    username: z.string().min(1).max(64).optional(),
    banner: z.string().min(1).max(32).optional(),
    favoriteOpening: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "at least one of username, banner, favoriteOpening is required",
  });
