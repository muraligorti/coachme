import * as workoutAssignmentService from "../services/workoutAssignmentService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function getAssignedClients(req, res) {
  try { res.json({ clientIds: await workoutAssignmentService.getAssignedClients(req.user.id, req.params.planId) }); }
  catch (err) { sendError(err, res, "Failed to load plan assignments"); }
}

export async function setAssignedClients(req, res) {
  try { res.json(await workoutAssignmentService.setAssignedClients(req.user.id, req.params.planId, req.body?.clientIds || [])); }
  catch (err) { sendError(err, res, "Failed to update plan assignments"); }
}

export async function getPlansForClient(req, res) {
  try { res.json({ plans: await workoutAssignmentService.getPlansForClient(req.user.id, req.params.clientId) }); }
  catch (err) { sendError(err, res, "Failed to load client's workout plans"); }
}

export async function getAssignedClientIdsForCoach(req, res) {
  try { res.json({ clientIds: await workoutAssignmentService.getAssignedClientIdsForCoach(req.user.id) }); }
  catch (err) { sendError(err, res, "Failed to load assigned clients"); }
}
