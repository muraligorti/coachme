// ═══════════════════════════════════════════════════════════════════════
// ADMIN CONTROLLER — the only layer here that touches req/res. All rules
// (RBAC validation, self-lockout guards, orphaned-client warnings) live
// in services/adminService.js.
// ═══════════════════════════════════════════════════════════════════════
import * as adminService from "../services/adminService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallbackMessage) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  logger.error(fallbackMessage, { error: err.message });
  return res.status(500).json({ error: fallbackMessage });
}

export async function listUsers(req, res) {
  try {
    const result = await adminService.listUsers(req.query);
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to list users"); }
}

export async function getUser(req, res) {
  try {
    const result = await adminService.getUserDetail(req.params.id);
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to load user"); }
}

export async function updateUser(req, res) {
  try {
    const result = await adminService.updateUser(req.user.id, req.params.id, req.body || {});
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to update user"); }
}

export async function forceLogout(req, res) {
  try {
    const result = await adminService.forceLogout(req.user.id, req.params.id);
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to force logout"); }
}

export async function getAuditLog(req, res) {
  try {
    const result = await adminService.getAuditLog(req.query);
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to load audit log"); }
}
