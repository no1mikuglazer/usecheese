/* Health check — what an uptime monitor should poll.
 *
 * Touches the database so a live process with a broken/missing DB reports
 * unhealthy instead of falsely reporting OK.
 */

import { Router } from "express";
import { getDb } from "../../db/connection.js";

export const healthRouter = Router();

// Cached lazily on first request rather than prepared fresh every poll —
// same pattern as every *.service.js module's getStatements().
let pingStatement = null;

function getPingStatement() {
  if (!pingStatement) pingStatement = getDb().prepare("SELECT 1 AS ok");
  return pingStatement;
}

healthRouter.get("/", (req, res) => {
  try {
    getPingStatement().get();
    res.json({
      status: "ok",
      db: "ok",
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch (err) {
    console.error("[health] database check failed:", err.message);
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});
