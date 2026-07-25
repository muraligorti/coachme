// ═══════════════════════════════════════════════════════════════════════
// INSIGHTS CONTROLLER — thin HTTP layer over insightsService. Same
// pattern as authController: extract input, call the service, map
// AppError (or an unexpected error) to an HTTP response. No logic here.
// ═══════════════════════════════════════════════════════════════════════
import * as insightsService from "../services/insightsService.js";
import * as profileRepository from "../repositories/profileRepository.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallbackMessage) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  logger.error(fallbackMessage, { error: err.message });
  return res.status(500).json({ error: fallbackMessage });
}

// Resolves the CoachProfile.id for the authenticated user — insights are
// keyed by CoachProfile.id (same as Booking/Lead), not User.id.
async function requireCoachProfile(req) {
  const profile = await profileRepository.findCoachProfileByUserId(req.user.id);
  if (!profile) throw new AppError(403, "Only coaches have insights");
  return profile;
}

export async function getBriefing(req, res) {
  try {
    const coach = await requireCoachProfile(req);
    const briefing = await insightsService.getBriefing(coach.id, req.user.id);
    res.json(briefing);
  } catch (err) { sendError(err, res, "Failed to load briefing"); }
}

export async function getClientRisks(req, res) {
  try {
    const coach = await requireCoachProfile(req);
    const { settings } = await insightsService.getSettings(req.user.id);
    const risks = await insightsService.computeClientRisks(coach.id, settings);
    res.json({ risks });
  } catch (err) { sendError(err, res, "Failed to load client risk data"); }
}

export async function getSettings(req, res) {
  try {
    await requireCoachProfile(req);
    const result = await insightsService.getSettings(req.user.id);
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to load insight settings"); }
}

export async function updateSettings(req, res) {
  try {
    await requireCoachProfile(req);
    const result = await insightsService.updateSettings(req.user.id, req.body || {});
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to update insight settings"); }
}
