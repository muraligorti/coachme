import * as exerciseTrendService from "../services/exerciseTrendService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function listOwnExerciseNames(req, res) {
  try { res.json({ exercises: await exerciseTrendService.listOwnExerciseNames(req.user.id) }); }
  catch (err) { sendError(err, res, "Failed to load exercise list"); }
}

export async function getOwnHistory(req, res) {
  try { res.json({ history: await exerciseTrendService.getOwnExerciseHistory(req.user.id, req.params.exerciseName) }); }
  catch (err) { sendError(err, res, "Failed to load exercise history"); }
}

export async function listExerciseNames(req, res) {
  try { res.json({ exercises: await exerciseTrendService.listExerciseNames(req.user.id, req.params.clientId) }); }
  catch (err) { sendError(err, res, "Failed to load exercise list"); }
}

export async function getHistory(req, res) {
  try { res.json({ history: await exerciseTrendService.getExerciseHistory(req.user.id, req.params.clientId, req.params.exerciseName) }); }
  catch (err) { sendError(err, res, "Failed to load exercise history"); }
}

export async function setSessionQuality(req, res) {
  try { res.json(await exerciseTrendService.setSessionQuality(req.user.id, req.params.sessionId, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to save quality rating"); }
}

export async function compareToLast(req, res) {
  try { res.json(await exerciseTrendService.compareToLastSession(req.user.id, req.params.clientId, req.params.exerciseName, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to compare to last session"); }
}
