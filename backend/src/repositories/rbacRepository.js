// ═══════════════════════════════════════════════════════════════════════
// RBAC REPOSITORY — pure Prisma data access for per-coach/per-client
// feature-visibility flags and profile category. Deliberately its own
// module (mounted at /api/rbac) rather than folded into the existing
// admin.js, same isolation reasoning as every other addition this
// session — I have adminRepository.js on disk right now, but staying
// consistent and not risking a blind edit to routes/admin.js since I
// still don't have that file's exact current contents.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findUserWithProfiles = (id, client = prisma) =>
  client.user.findUnique({ where: { id }, select: { id: true, role: true, coachProfile: { select: { id: true, featureFlags: true, category: true } }, clientProfile: { select: { id: true, featureFlags: true, category: true } } } });

export const updateCoachFeatureFlags = (coachProfileId, featureFlags, client = prisma) =>
  client.coachProfile.update({ where: { id: coachProfileId }, data: { featureFlags } });

export const updateClientFeatureFlags = (clientProfileId, featureFlags, client = prisma) =>
  client.clientProfile.update({ where: { id: clientProfileId }, data: { featureFlags } });

export const updateCoachCategory = (coachProfileId, category, client = prisma) =>
  client.coachProfile.update({ where: { id: coachProfileId }, data: { category } });

export const updateClientCategory = (clientProfileId, category, client = prisma) =>
  client.clientProfile.update({ where: { id: clientProfileId }, data: { category } });

export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId }, select: { featureFlags: true, category: true } });

export const findClientProfileByUserId = (userId, client = prisma) =>
  client.clientProfile.findUnique({ where: { userId }, select: { featureFlags: true, category: true } });
