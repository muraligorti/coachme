// ═══════════════════════════════════════════════════════════════════════
// SESSION REPOSITORY — pure Prisma data access for the Session table.
// No knowledge of JWTs, single-session policy, or Redis — that's
// services/tokenService.js's job. This file just persists rows.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findAllForUser = (userId, client = prisma) =>
  client.session.findMany({ where: { userId } });

export const findByRefreshToken = (refreshToken, client = prisma) =>
  client.session.findUnique({ where: { refreshToken } });

export const create = (data, client = prisma) =>
  client.session.create({ data });

export const updateTokens = (id, data, client = prisma) =>
  client.session.update({ where: { id }, data });

export const deleteAllForUser = (userId, client = prisma) =>
  client.session.deleteMany({ where: { userId } });

export const deleteByUserAndToken = (userId, token, client = prisma) =>
  client.session.deleteMany({ where: { userId, token } });
