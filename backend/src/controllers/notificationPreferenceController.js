import * as service from "../services/notificationPreferenceService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function getMine(req, res) {
  try { res.json(await service.getMyPreferences(req.user.id)); }
  catch (err) { sendError(err, res, "Failed to load notification preferences"); }
}

export async function updateMine(req, res) {
  try { res.json(await service.updateMyPreferences(req.user.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to update notification preferences"); }
}

// Called by the scheduled GitHub Actions cron job, not a logged-in user —
// authenticated via a shared secret header instead of a normal JWT (see
// the requireCronSecret middleware in this route file).
export async function runReminders(req, res) {
  try { res.json(await service.runReminderScan()); }
  catch (err) {
    logger.error("Reminder scan failed", { error: err.message });
    res.status(500).json({ error: "Reminder scan failed" });
  }
}
