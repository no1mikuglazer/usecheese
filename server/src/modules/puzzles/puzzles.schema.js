/* Request schemas for the puzzles endpoints. */

import { z } from "zod";

const RATING_FLOOR = 0;
const RATING_CEILING = 3500;

const ratingParam = z.coerce
  .number()
  .int()
  .min(RATING_FLOOR)
  .max(RATING_CEILING);

export const randomPuzzleQuerySchema = z
  .object({
    minRating: ratingParam.default(400),
    maxRating: ratingParam.default(2800),
  })
  .refine((q) => q.minRating <= q.maxRating, {
    message: "minRating must be less than or equal to maxRating",
    path: ["minRating"],
  });

// Lichess puzzle ids are short alphanumeric strings ("00008", "0000D").
// Checking the shape here means malformed ids never reach the database.
export const puzzleIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[A-Za-z0-9]{4,8}$/, "must be 4-8 alphanumeric characters"),
});
