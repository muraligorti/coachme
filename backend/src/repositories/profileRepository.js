// ═══════════════════════════════════════════════════════════════════════
// PROFILE REPOSITORY — pure Prisma data access for the tables that make
// up a user's "profile aggregate": CoachProfile, ClientProfile,
// Subscription, and MedicalData. Grouped together because they're always
// read/written alongside each other during registration and auth flows.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

// ── Coach profile ──
export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId } });

export const findCoachProfileByPhone = (phoneSuffix, client = prisma) =>
  client.coachProfile.findFirst({ where: { phone: { contains: phoneSuffix } } });

export const createCoachProfile = (data, client = prisma) =>
  client.coachProfile.create({ data });

export const updateCoachProfile = (userId, data, client = prisma) =>
  client.coachProfile.update({ where: { userId }, data });

// ── Client profile ──
export const findClientProfileByUserId = (userId, client = prisma) =>
  client.clientProfile.findUnique({ where: { userId } });

export const findClientProfileByPhone = (phoneSuffix, client = prisma) =>
  client.clientProfile.findFirst({ where: { phone: { contains: phoneSuffix } } });

export const createClientProfile = (data, client = prisma) =>
  client.clientProfile.create({ data });

export const updateClientProfile = (userId, data, client = prisma) =>
  client.clientProfile.update({ where: { userId }, data });

// ── Medical data ──
export const createMedicalData = (data, client = prisma) =>
  client.medicalData.create({ data });

// ── Subscription ──
export const findSubscriptionByUserId = (userId, client = prisma) =>
  client.subscription.findUnique({ where: { userId } });

export const createSubscription = (data, client = prisma) =>
  client.subscription.create({ data });
