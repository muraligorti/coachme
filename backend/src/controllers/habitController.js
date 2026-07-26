import * as habitService from "../services/habitService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function listOwn(req, res) {
  try { res.json({ habits: await habitService.listOwnHabits(req.user.id) }); }
  catch (err) { sendError(err, res, "Failed to load habits"); }
}

export async function listForClient(req, res) {
  try { res.json({ habits: await habitService.listClientHabits(req.user.id, req.params.clientId) }); }
  catch (err) { sendError(err, res, "Failed to load client habits"); }
}

export async function create(req, res) {
  try { res.status(201).json(await habitService.createHabit(req.user.id, req.body?.name, req.body?.icon)); }
  catch (err) { sendError(err, res, "Failed to create habit"); }
}

export async function remove(req, res) {
  try { res.json(await habitService.deleteHabit(req.user.id, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to delete habit"); }
}

export async function toggle(req, res) {
  try { res.json(await habitService.toggleHabit(req.user.id, req.params.id, req.body?.date)); }
  catch (err) { sendError(err, res, "Failed to update habit"); }
}
