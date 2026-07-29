// ═══════════════════════════════════════════════════════════════════════
// COACH PROFILE REPOSITORY — self-service for a coach's own profile
// details (specialization, tier lookup). Additive, isolated module.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId } });

export const findSubscriptionByUserId = (userId, client = prisma) =>
  client.subscription.findUnique({ where: { userId } });

export const updateSpecializations = (userId, specializations, client = prisma) =>
  client.coachProfile.update({ where: { userId }, data: { specializations } });
