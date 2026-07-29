// ═══════════════════════════════════════════════════════════════════════
// WORKOUT ASSIGNMENT REPOSITORY — pure Prisma data access for the
// many-to-many plan<->client junction table. Additive, isolated module —
// doesn't touch whatever the existing WorkoutPlan model/routes do.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId } });

export const findPlanById = (planId, client = prisma) => client.workoutPlan.findUnique({ where: { id: planId } });

export const findActiveRelationship = (coachId, clientId, client = prisma) =>
  client.clientCoach.findFirst({ where: { coachId, clientId, status: "active" } });

// Every client currently assigned to a plan — powers the checkbox
// pre-fill when a coach reopens a plan to edit its assignment.
export const findAssignedClientIds = (planId, client = prisma) =>
  client.workoutPlanAssignment.findMany({ where: { workoutPlanId: planId }, select: { clientId: true } });

// Replaces the FULL assignment set for a plan in one shot — matches the
// checkbox UI naturally: the coach checks/unchecks a list, then saves
// the resulting set, rather than issuing individual add/remove calls.
export async function setAssignments(planId, clientIds, client = prisma) {
  await client.workoutPlanAssignment.deleteMany({ where: { workoutPlanId: planId, clientId: { notIn: clientIds } } });
  for (const clientId of clientIds) {
    await client.workoutPlanAssignment.upsert({
      where: { workoutPlanId_clientId: { workoutPlanId: planId, clientId } },
      create: { workoutPlanId: planId, clientId },
      update: {},
    });
  }
  return client.workoutPlanAssignment.findMany({ where: { workoutPlanId: planId } });
}

// Every plan assigned to one client — replaces the old, fragile
// client-side "p.clientId === clientId" filter that only ever supported
// one client per plan.
export const findPlansForClient = (clientId, client = prisma) =>
  client.workoutPlanAssignment.findMany({
    where: { clientId },
    include: { workoutPlan: true },
    orderBy: { assignedAt: "desc" },
  });

// Every distinct client this coach has assigned at least one plan to —
// powers the roster-wide "💪 Workout" badge without an N+1 call per client.
export const findAssignedClientIdsForCoach = (coachId, client = prisma) =>
  client.workoutPlanAssignment.findMany({
    where: { workoutPlan: { coachId } },
    select: { clientId: true },
    distinct: ["clientId"],
  });
