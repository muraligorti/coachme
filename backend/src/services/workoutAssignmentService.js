// ═══════════════════════════════════════════════════════════════════════
// WORKOUT ASSIGNMENT SERVICE — a coach can assign a plan to any/all of
// their own active roster clients. Both the plan and every client in the
// requested list are ownership/relationship-checked — a coach can't
// assign someone else's plan, or assign to a client not actually theirs.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as repo from "../repositories/workoutAssignmentRepository.js";

async function getCoachProfileOrThrow(userId) {
  const coach = await repo.findCoachProfileByUserId(userId);
  if (!coach) throw new AppError(403, "Only coaches can manage workout assignments");
  return coach;
}

async function verifyPlanOwnership(coach, planId) {
  const plan = await repo.findPlanById(planId);
  if (!plan) throw new AppError(404, "Workout plan not found");
  if (plan.coachId && plan.coachId !== coach.id) throw new AppError(403, "This isn't your workout plan");
  return plan;
}

export async function getAssignedClients(userId, planId) {
  const coach = await getCoachProfileOrThrow(userId);
  await verifyPlanOwnership(coach, planId);
  const rows = await repo.findAssignedClientIds(planId);
  // daysOfWeek is technically per (plan, client) row, but setAssignedClients
  // always writes the SAME days across every client in one save action —
  // so the first row's days is a reasonable pre-fill default when
  // reopening this plan to edit, even though in principle two different
  // save actions over time could have left different clients with
  // different days (edge case, not the common flow).
  return { clientIds: rows.map((r) => r.clientId), daysOfWeek: rows[0]?.daysOfWeek || [] };
}

const DAY_VALIDATION = (days) => {
  if (!Array.isArray(days)) throw new AppError(400, "daysOfWeek must be an array");
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new AppError(400, "daysOfWeek values must be integers 0-6 (0=Sunday)");
};

export async function setAssignedClients(userId, planId, clientIds, daysOfWeek = []) {
  if (!Array.isArray(clientIds)) throw new AppError(400, "clientIds must be an array");
  DAY_VALIDATION(daysOfWeek);
  const coach = await getCoachProfileOrThrow(userId);
  await verifyPlanOwnership(coach, planId);

  // Every requested client must actually be on this coach's active
  // roster — otherwise a coach could assign a plan to someone else's client.
  for (const clientId of clientIds) {
    const rel = await repo.findActiveRelationship(coach.id, clientId);
    if (!rel) throw new AppError(403, `Client ${clientId} is not on your roster`);
  }

  await repo.setAssignments(planId, clientIds, daysOfWeek);
  return { clientIds, daysOfWeek };
}

export async function getPlansForClient(userId, clientId) {
  const coach = await getCoachProfileOrThrow(userId);
  const rel = await repo.findActiveRelationship(coach.id, clientId);
  if (!rel) throw new AppError(403, "This client is not on your roster");
  const rows = await repo.findPlansForClient(clientId);
  // Include daysOfWeek alongside each plan so the frontend can show a
  // real weekly-split view (see mockup "Client's Weekly Split") without
  // a second round-trip.
  return rows.map((r) => ({ ...r.workoutPlan, daysOfWeek: r.daysOfWeek }));
}

export async function getAssignedClientIdsForCoach(userId) {
  const coach = await getCoachProfileOrThrow(userId);
  const rows = await repo.findAssignedClientIdsForCoach(coach.id);
  return rows.map((r) => r.clientId);
}

// ── Day-wise scheduling: today's plan + weekly completion ──────────────

function currentWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sunday
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - day); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

// Returns whatever plan(s) are scheduled for TODAY for this client, each
// enriched with this week's completion count and the last time it was
// logged. Returns an empty array if nothing is scheduled today — the
// frontend falls back to showing the client's generic assigned plans
// (see mockup: Ananya with "no plan scheduled today").
export async function getTodaysWorkout(userId, clientId) {
  const coach = await getCoachProfileOrThrow(userId);
  const rel = await repo.findActiveRelationship(coach.id, clientId);
  if (!rel) throw new AppError(403, "This client is not on your roster");

  const todayDow = new Date().getDay();
  const assignments = await repo.findAssignmentsForDay(clientId, todayDow);
  const { weekStart, weekEnd } = currentWeekBounds();

  return Promise.all(assignments.map(async (a) => {
    const sessions = await repo.findSessionDatesForPlanThisWeek(clientId, a.workoutPlanId, weekStart, weekEnd);
    const distinctDays = new Set(sessions.map((s) => s.completedAt.toISOString().slice(0, 10)));
    const last = await repo.findLastSessionForPlan(clientId, a.workoutPlanId);
    return {
      plan: a.workoutPlan,
      completedThisWeek: distinctDays.size,
      lastCompletedAt: last?.completedAt || null,
      lastExerciseName: last?.exerciseName || null,
    };
  }));
}

// Maps a multi-section template to one or more clients — creates a real,
// independent WorkoutPlan + WorkoutPlanAssignment per (client, section)
// pair, seeded from the template's current content and default days.
// This is a COPY: editing the template afterward never retroactively
// changes what was already mapped here, and adjusting one client's days
// afterward is just editing that resulting plan's own assignment
// (already-existing functionality) — no separate "override" system needed.
export async function mapTemplateToClients(userId, templateId, clientIds) {
  if (!Array.isArray(clientIds) || clientIds.length === 0) throw new AppError(400, "Select at least one client");
  const coach = await getCoachProfileOrThrow(userId);

  const template = await repo.findTemplateById(templateId);
  if (!template) throw new AppError(404, "Template not found");
  if (template.coachId && template.coachId !== coach.id) throw new AppError(403, "This isn't your template");
  if (!Array.isArray(template.sections) || template.sections.length === 0) throw new AppError(400, "This template has no sections to map");

  for (const clientId of clientIds) {
    const rel = await repo.findActiveRelationship(coach.id, clientId);
    if (!rel) throw new AppError(403, `Client ${clientId} is not on your roster`);
  }

  const created = await repo.mapTemplateToClients(coach.id, template, clientIds);
  return { created, clientCount: clientIds.length };
}
