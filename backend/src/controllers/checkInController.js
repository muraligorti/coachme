import * as checkInService from "../services/checkInService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function submit(req, res) {
  try { res.status(201).json(await checkInService.submitCheckIn(req.user.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to submit check-in"); }
}

export async function listOwn(req, res) {
  try { res.json({ checkIns: await checkInService.getOwnCheckIns(req.user.id) }); }
  catch (err) { sendError(err, res, "Failed to load check-ins"); }
}

export async function listForClient(req, res) {
  try { res.json({ checkIns: await checkInService.getClientCheckIns(req.user.id, req.params.clientId) }); }
  catch (err) { sendError(err, res, "Failed to load client check-ins"); }
}
