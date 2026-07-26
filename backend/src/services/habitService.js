// ═══════════════════════════════════════════════════════════════════════
// HABIT SERVICE — a client manages their own habits and daily toggles;
// a coach may VIEW (read-only) a client's habits and streaks, gated by
// the same active-roster check checkInService already defines.
//
// Streak computation lives here (business logic), not in the repository.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as checkInRepository from "../repositories/checkInRepository.js"; // profile/relationship lookups live here, shared across this feature pair
import * as habitRepository from "../repositories/habitRepository.js";
import { verifyCoachHasClient } from "./checkInService.js";

async function getOwnClientProfileId(userId) {
  const profile = await checkInRepository.findClientProfileByUserId(userId);
  if (!profile) throw new AppError(403, "Only clients can manage habits");
  return profile.id;
}

// Consecutive-day streak counting backward from today, based on the
// logs already loaded (repository caps at ~90 days, plenty for this).
function computeStreak(logs) {
  const completedDates = new Set(logs.filter((l) => l.completed).map((l) => l.date));
  let streak = 0;
  const d = new Date();
  while (completedDates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function shapeHabits(habits) {
  return habits.map((h) => ({
    id: h.id, name: h.name, icon: h.icon, createdAt: h.createdAt,
    streak: computeStreak(h.logs),
    log: Object.fromEntries(h.logs.filter((l) => l.completed).map((l) => [l.date, true])),
  }));
}

export async function listOwnHabits(userId) {
  const clientId = await getOwnClientProfileId(userId);
  const habits = await habitRepository.findHabitsForClient(clientId);
  return shapeHabits(habits);
}

export async function listClientHabits(coachUserId, clientId) {
  await verifyCoachHasClient(coachUserId, clientId);
  const habits = await habitRepository.findHabitsForClient(clientId);
  return shapeHabits(habits);
}

export async function createHabit(userId, name, icon) {
  if (!name || !name.trim()) throw new AppError(400, "Habit name is required");
  const clientId = await getOwnClientProfileId(userId);
  return habitRepository.createHabit(clientId, name.trim(), icon);
}

export async function deleteHabit(userId, habitId) {
  const clientId = await getOwnClientProfileId(userId);
  const habit = await habitRepository.findHabitById(habitId);
  if (!habit || habit.clientId !== clientId) throw new AppError(404, "Habit not found");
  await habitRepository.deleteHabit(habitId);
  return { message: "Habit deleted" };
}

export async function toggleHabit(userId, habitId, date) {
  const clientId = await getOwnClientProfileId(userId);
  const habit = await habitRepository.findHabitById(habitId);
  if (!habit || habit.clientId !== clientId) throw new AppError(404, "Habit not found");
  return habitRepository.toggleHabitLog(habitId, date || new Date().toISOString().slice(0, 10));
}
