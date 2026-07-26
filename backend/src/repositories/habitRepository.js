// ═══════════════════════════════════════════════════════════════════════
// HABIT REPOSITORY — pure Prisma data access for Habit + HabitLog.
// Streak computation lives in the service layer (business logic), not
// here — this file only reads/writes rows.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findHabitsForClient = (clientId, client = prisma) =>
  client.habit.findMany({
    where: { clientId },
    include: { logs: { orderBy: { date: "desc" }, take: 90 } }, // ~3 months is plenty for streak math + a weekly view
    orderBy: { createdAt: "asc" },
  });

export const createHabit = (clientId, name, icon, client = prisma) =>
  client.habit.create({ data: { clientId, name, icon: icon || "✨" } });

export const findHabitById = (id, client = prisma) => client.habit.findUnique({ where: { id } });

export const deleteHabit = (id, client = prisma) => client.habit.delete({ where: { id } });

export const toggleHabitLog = async (habitId, date, client = prisma) => {
  const existing = await client.habitLog.findUnique({ where: { habitId_date: { habitId, date } } });
  if (existing) { await client.habitLog.delete({ where: { habitId_date: { habitId, date } } }); return { completed: false }; }
  await client.habitLog.create({ data: { habitId, date, completed: true } });
  return { completed: true };
};
