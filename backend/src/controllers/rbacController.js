import * as rbacService from "../services/rbacService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function getMine(req, res) {
  try { res.json(await rbacService.getMyFeatures(req.user.id, req.user.role)); }
  catch (err) { sendError(err, res, "Failed to load feature access"); }
}

export async function getForUser(req, res) {
  try { res.json(await rbacService.getUserFeatures(req.params.userId)); }
  catch (err) { sendError(err, res, "Failed to load feature access"); }
}

export async function setFlags(req, res) {
  try { res.json(await rbacService.setUserFeatureFlags(req.params.userId, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to update feature access"); }
}

export async function setCategory(req, res) {
  try { res.json(await rbacService.setUserCategory(req.params.userId, req.body?.category)); }
  catch (err) { sendError(err, res, "Failed to update category"); }
}
