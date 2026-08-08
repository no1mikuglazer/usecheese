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
