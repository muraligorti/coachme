// ═══════════════════════════════════════════════════════════════════════
// USER REPOSITORY — the only file that knows the User table's Prisma
// shape. Every function takes an optional `client` (defaults to the
// shared prisma instance) so callers can pass a transaction's `tx` client
// to make several repository calls commit atomically.
//
// Deliberately dumb: no validation, no password hashing, no business
// rules — just "read this row" / "write this row". That logic belongs in
// services/authService.js.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findByEmail = (email, client = prisma) =>
  client.user.findUnique({ where: { email } });

export const findById = (id, client = prisma) =>
  client.user.findUnique({ where: { id } });

export const findByIdBasic = (id, client = prisma) =>
  client.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, createdAt: true },
  });

export const create = (data, client = prisma) =>
  client.user.create({ data });

export const updateById = (id, data, client = prisma) =>
  client.user.update({ where: { id }, data });

// Users with a currently-valid password reset code pending.
export const findManyWithActiveReset = (client = prisma) =>
  client.user.findMany({ where: { resetExpires: { gt: new Date() } } });
