/* Puzzle rating scoring — a pure function of puzzle difficulty only, not the
 * solver's own rating (this is not Elo/Glicko). A clean solve rewards more
 * for a harder puzzle; a wrong-move-or-hint solve costs less for a harder
 * puzzle, since missing something genuinely difficult is less damning than
 * missing something easy.
 */

const PUZZLE_RATING_FLOOR = 400;
const PUZZLE_RATING_CEILING = 3300;

const REWARD_MIN = 2; // at PUZZLE_RATING_FLOOR
const REWARD_MAX = 40; // at PUZZLE_RATING_CEILING

const PENALTY_MAX = 20; // magnitude at PUZZLE_RATING_FLOOR
const PENALTY_MIN = 3; // magnitude at PUZZLE_RATING_CEILING

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function computeRatingDelta(puzzleRating, correct) {
  const t =
    (clamp(puzzleRating, PUZZLE_RATING_FLOOR, PUZZLE_RATING_CEILING) - PUZZLE_RATING_FLOOR) /
    (PUZZLE_RATING_CEILING - PUZZLE_RATING_FLOOR);

  if (correct) {
    return Math.round(REWARD_MIN + t * (REWARD_MAX - REWARD_MIN));
  }
  return -Math.round(PENALTY_MAX - t * (PENALTY_MAX - PENALTY_MIN));
}
