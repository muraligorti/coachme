import * as bookingRequestService from "../services/bookingRequestService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function getMyCoaches(req, res) {
  try { res.json({ coaches: await bookingRequestService.getMyCoaches(req.user.id) }); }
  catch (err) { sendError(err, res, "Failed to load your coaches"); }
}

export async function getAvailability(req, res) {
  try { res.json({ busy: await bookingRequestService.getCoachAvailability(req.user.id, req.params.coachId, req.query.date) }); }
  catch (err) { sendError(err, res, "Failed to load availability"); }
}

export async function requestSession(req, res) {
  try { res.status(201).json(await bookingRequestService.requestSession(req.user.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to request session"); }
}
