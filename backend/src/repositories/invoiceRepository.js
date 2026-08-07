import { prisma } from "../server.js";

export const create = (data, client = prisma) => client.invoice.create({ data });

export const findById = (id, client = prisma) => client.invoice.findUnique({ where: { id }, include: { client: true } });

export const findForCoach = (coachId, client = prisma) =>
  client.invoice.findMany({ where: { coachId }, include: { client: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" } });

export const updateById = (id, data, client = prisma) => client.invoice.update({ where: { id }, data });
