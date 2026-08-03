/* Puzzle queries.
 *
 * The random-by-rating lookup avoids `ORDER BY RANDOM()`, which would make
 * SQLite touch every matching row (O(n)) on every request — unusable across
 * six million puzzles.
 *
 * Instead, the import writes rows in rating order, so `id` (the rowid) is
 * monotonically correlated with `rating`. Finding the id range for a rating
 * window is then two index-boundary lookups, and picking a puzzle from it is a
 * single primary-key hit. Nothing in the request path scans.
 *
 * That correlation holds because the table is built once by a single ordered
 * INSERT (see scripts/import-puzzles.js). Appending rows piecemeal later would
 * break it — the fix then is a full reimport, not incremental patching.
 */

import { getDb } from "../../db/connection.js";
import { ApiError } from "../../lib/ApiError.js";

let statements = null;

function getStatements() {
  if (statements) return statements;

  const db = getDb();
  statements = {
    // Both boundary queries use idx_puzzles_rating for the filter *and* the
    // sort, so SQLite walks straight to the edge of the range and stops.
    lowestIdAtOrAbove: db.prepare(
      "SELECT id FROM puzzles WHERE rating >= ? ORDER BY rating ASC LIMIT 1",
    ),
    highestIdAtOrBelow: db.prepare(
      "SELECT id FROM puzzles WHERE rating <= ? ORDER BY rating DESC LIMIT 1",
    ),
    byRowId: db.prepare("SELECT * FROM puzzles WHERE id = ?"),
    byPuzzleId: db.prepare("SELECT * FROM puzzles WHERE puzzle_id = ?"),
    countAll: db.prepare("SELECT COUNT(*) AS count FROM puzzles"),
  };
  return statements;
}

// Themes and moves are stored as space-separated text (SQLite has no array
// type); the API hands back real arrays so the frontend never parses strings.
function toApiShape(row) {
  return {
    id: row.puzzle_id,
    fen: row.fen,
    moves: row.moves.split(" ").filter(Boolean),
    rating: row.rating,
    themes: row.themes ? row.themes.split(" ").filter(Boolean) : [],
  };
}

export function getRandomPuzzle({ minRating, maxRating }) {
  const stmts = getStatements();

  const low = stmts.lowestIdAtOrAbove.get(minRating);
  const high = stmts.highestIdAtOrBelow.get(maxRating);

  if (!low || !high || low.id > high.id) {
    throw ApiError.notFound("no_puzzles_in_range", { minRating, maxRating });
  }

  const span = high.id - low.id + 1;
  const randomId = low.id + Math.floor(Math.random() * span);

  const row = stmts.byRowId.get(randomId);
  if (!row) {
    // Ids are contiguous after a clean import, so this should be unreachable.
    throw new Error(`puzzle row ${randomId} missing from a contiguous range`);
  }

  return toApiShape(row);
}

export function getPuzzleById(puzzleId) {
  const row = getStatements().byPuzzleId.get(puzzleId);
  if (!row) throw ApiError.notFound("puzzle_not_found");
  return toApiShape(row);
}

export function getPuzzleCount() {
  return getStatements().countAll.get().count;
}
