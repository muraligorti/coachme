// ═══════════════════════════════════════════════════════════════════════
// ADMIN REPOSITORY — pure Prisma data access for platform administration:
// paginated/filtered user listing across all roles, user detail with
// profile+subscription joined, RBAC updates, forced logout, and audit
// log queries. No business rules here — see services/adminService.js.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

// ── Users ─────────────────────────────────────────────────────────────

export const findUsers = ({ role, search, isActive, page = 1, pageSize = 25 }, client = prisma) => {
  const where = {};
  if (role) where.role = role;
  if (typeof isActive === "boolean") where.isActive = isActive;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { coachProfile: { displayName: { contains: search, mode: "insensitive" } } },
      { clientProfile: { displayName: { contains: search, mode: "insensitive" } } },
    ];
  }
  return client.user.findMany({
    where,
    select: {
      id: true, email: true, role: true, isActive: true, emailVerified: true,
      lastLogin: true, createdAt: true, avatarUrl: true,
      coachProfile: { select: { displayName: true } },
      clientProfile: { select: { displayName: true } },
      subscription: { select: { tier: true, maxClients: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
};

export const countUsers = ({ role, search, isActive }, client = prisma) => {
  const where = {};
  if (role) where.role = role;
  if (typeof isActive === "boolean") where.isActive = isActive;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { coachProfile: { displayName: { contains: search, mode: "insensitive" } } },
      { clientProfile: { displayName: { contains: search, mode: "insensitive" } } },
    ];
  }
  return client.user.count({ where });
};

export const findUserById = (id, client = prisma) => client.user.findUnique({
  where: { id },
  select: {
    id: true, email: true, role: true, isActive: true, emailVerified: true, googleId: true,
    lastLogin: true, loginAttempts: true, lockedUntil: true, createdAt: true, updatedAt: true, avatarUrl: true,
    coachProfile: true, clientProfile: true, subscription: true,
    _count: { select: { sessions: true, auditLogs: true } },
  },
});

export const updateUser = (id, data, client = prisma) => client.user.update({ where: { id }, data });

export const deleteAllSessionsForUser = (userId, client = prisma) => client.session.deleteMany({ where: { userId } });

// A coach's active client count — used to warn an admin before deactivating
// a coach who has clients still depending on them.
export const countActiveClientsForCoach = (coachProfileId, client = prisma) =>
  client.clientCoach.count({ where: { coachId: coachProfileId, status: "active" } });

// ── Audit log ────────────────────────────────────────────────────────

export const findAuditLog = ({ userId, action, resource, page = 1, pageSize = 50 }, client = prisma) => {
  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (resource) where.resource = resource;
  return client.auditLog.findMany({
    where,
    select: { id: true, action: true, resource: true, resourceId: true, ipAddress: true, details: true, createdAt: true, user: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
};

export const countAuditLog = ({ userId, action, resource }, client = prisma) => {
  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (resource) where.resource = resource;
  return client.auditLog.count({ where });
};

export const createAuditEntry = (data, client = prisma) => client.auditLog.create({ data });
