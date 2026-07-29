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
  return rows.map((r) => r.clientId);
}

export async function setAssignedClients(userId, planId, clientIds) {
  if (!Array.isArray(clientIds)) throw new AppError(400, "clientIds must be an array");
  const coach = await getCoachProfileOrThrow(userId);
  await verifyPlanOwnership(coach, planId);

  // Every requested client must actually be on this coach's active
  // roster — otherwise a coach could assign a plan to someone else's client.
  for (const clientId of clientIds) {
    const rel = await repo.findActiveRelationship(coach.id, clientId);
    if (!rel) throw new AppError(403, `Client ${clientId} is not on your roster`);
  }

  await repo.setAssignments(planId, clientIds);
  return { clientIds };
}

export async function getPlansForClient(userId, clientId) {
  const coach = await getCoachProfileOrThrow(userId);
  const rel = await repo.findActiveRelationship(coach.id, clientId);
  if (!rel) throw new AppError(403, "This client is not on your roster");
  const rows = await repo.findPlansForClient(clientId);
  return rows.map((r) => r.workoutPlan);
}

export async function getAssignedClientIdsForCoach(userId) {
  const coach = await getCoachProfileOrThrow(userId);
  const rows = await repo.findAssignedClientIdsForCoach(coach.id);
  return rows.map((r) => r.clientId);
}
