import * as coachProfileService from "../services/coachProfileService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function getMyProfile(req, res) {
  try { res.json(await coachProfileService.getMyProfile(req.user.id)); }
  catch (err) { sendError(err, res, "Failed to load profile"); }
}

export async function setMySpecializations(req, res) {
  try { res.json(await coachProfileService.setMySpecializations(req.user.id, req.body?.specializations || [])); }
  catch (err) { sendError(err, res, "Failed to update specializations"); }
}
