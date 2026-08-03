/* Puzzle route handlers — translate validated requests into service calls. */

import * as puzzlesService from "./puzzles.service.js";

export function randomPuzzle(req, res) {
  const { minRating, maxRating } = req.validated.query;
  res.json(puzzlesService.getRandomPuzzle({ minRating, maxRating }));
}

export function puzzleById(req, res) {
  res.json(puzzlesService.getPuzzleById(req.validated.params.id));
}

export function puzzleStats(req, res) {
  res.json({ count: puzzlesService.getPuzzleCount() });
}
