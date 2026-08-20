/* Synthetic puzzle rows for the test suite — single source of truth for
 * both build-puzzles-db.js (which writes them into a real SQLite file) and
 * every test that asserts against specific puzzle data.
 *
 * Ratings run 0-2800 in steps of 50 (matching the API's default
 * minRating=400/maxRating=2800 band, plus some below it for clamp/penalty
 * testing). 2801-3500 is a deliberate gap with no puzzles, used to test the
 * "no_puzzles_in_range" 404 path.
 */

const BASE_FEN = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24";
const BASE_MOVES = ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"];

function themesFor(rating) {
  if (rating < 1000) return ["short", "opening", "middlegame"];
  if (rating < 2000) return ["crushing", "hangingPiece", "middlegame"];
  return ["advantage", "long", "endgame"];
}

export const PUZZLES = [];
for (let rating = 0; rating <= 2800; rating += 50) {
  const n = PUZZLES.length;
  PUZZLES.push({
    // 4-8 alphanumeric chars, matching puzzles.schema.js's id regex.
    puzzleId: `t${String(n).padStart(4, "0")}`,
    fen: BASE_FEN,
    moves: BASE_MOVES,
    rating,
    ratingDeviation: 75,
    popularity: 80,
    nbPlays: 1000,
    themes: themesFor(rating),
    openingTags: null,
  });
}

export const PUZZLE_COUNT = PUZZLES.length;

// Deliberately empty rating band — nothing in the fixture falls here.
export const EMPTY_BAND = { minRating: 2801, maxRating: 3500 };
