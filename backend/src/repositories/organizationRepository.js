import { prisma } from "../server.js";

export const create = (data, client = prisma) => client.organization.create({ data });

export const findById = (id, client = prisma) => client.organization.findUnique({ where: { id } });

export const update = (id, data, client = prisma) => client.organization.update({ where: { id }, data });

export const findMembership = (userId, organizationId, client = prisma) =>
  client.organizationMembership.findUnique({ where: { userId_organizationId: { userId, organizationId } } });

export const findMembershipsForUser = (userId, client = prisma) =>
  client.organizationMembership.findMany({ where: { userId }, include: { organization: true } });

export const createMembership = (data, client = prisma) => client.organizationMembership.create({ data });

export const deleteMembership = (userId, organizationId, client = prisma) =>
  client.organizationMembership.delete({ where: { userId_organizationId: { userId, organizationId } } });

export const findMembersForOrg = (organizationId, client = prisma) =>
  client.organizationMembership.findMany({ where: { organizationId }, include: { user: { select: { id: true, email: true } } } });

// Org-scoped coach/client lists - always filtered by organizationId at
// the query itself, never left to the caller to filter after the fact.
export const findCoachesForOrg = (organizationId, client = prisma) =>
  client.coachProfile.findMany({ where: { organizationId } });

export const findClientsForOrg = (organizationId, client = prisma) =>
  client.clientProfile.findMany({ where: { organizationId } });

export const countClientsForOrg = (organizationId, client = prisma) =>
  client.clientProfile.count({ where: { organizationId } });

export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId } });

export const findClientProfileById = (id, client = prisma) =>
  client.clientProfile.findUnique({ where: { id } });

export const setCoachOrganization = (coachProfileId, organizationId, client = prisma) =>
  client.coachProfile.update({ where: { id: coachProfileId }, data: { organizationId } });

export const setClientOrganization = (clientProfileId, organizationId, client = prisma) =>
  client.clientProfile.update({ where: { id: clientProfileId }, data: { organizationId } });

// Reuses the existing ClientCoach table exactly as-is - a gym mapping is
// no different structurally from a solo-coach mapping, which is what
// makes coach-side access control (verifyCoachHasClient in
// checkInService.js) work unchanged for gym coaches too.
export const createClientCoachMapping = (data, client = prisma) => client.clientCoach.create({ data });

export const findClientCoachMapping = (clientId, coachId, coachingType, client = prisma) =>
  client.clientCoach.findUnique({ where: { clientId_coachId_coachingType: { clientId, coachId, coachingType } } });

export const findMappingsForClient = (clientId, client = prisma) =>
  client.clientCoach.findMany({ where: { clientId, status: "active" }, include: { coach: { select: { id: true, displayName: true, userId: true } } } });

export const endClientCoachMapping = (id, client = prisma) =>
  client.clientCoach.update({ where: { id }, data: { status: "ended", endDate: new Date() } });
