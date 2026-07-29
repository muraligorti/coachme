import * as exerciseLibraryService from "../services/exerciseLibraryService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function listExercises(req, res) {
  try { res.json({ exercises: await exerciseLibraryService.listExercises(req.user.id) }); }
  catch (err) { sendError(err, res, "Failed to load exercise library"); }
}

export async function addExercise(req, res) {
  try { res.status(201).json(await exerciseLibraryService.addExercise(req.user.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to add exercise"); }
}

export async function removeExercise(req, res) {
  try { res.json(await exerciseLibraryService.removeExercise(req.user.id, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to remove exercise"); }
}

export async function listTemplates(req, res) {
  try { res.json({ templates: await exerciseLibraryService.listTemplates(req.user.id) }); }
  catch (err) { sendError(err, res, "Failed to load templates"); }
}

export async function addTemplate(req, res) {
  try { res.status(201).json(await exerciseLibraryService.addTemplate(req.user.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to add template"); }
}

export async function removeTemplate(req, res) {
  try { res.json(await exerciseLibraryService.removeTemplate(req.user.id, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to remove template"); }
}
