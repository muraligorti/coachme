// ═══════════════════════════════════════════════════════════════════════
// SEED: Daily Briefing demo data for coach@fitos-nexus.com
//
// Creates 3 demo clients under this coach with deliberately different
// histories, so every branch of insightsService's risk logic actually
// has something to show:
//   1. "Demo — Needs Attention (Severe)"   -> flags on ONE severe signal alone
//   2. "Demo — Needs Attention (Moderate)" -> flags on TWO moderate signals together
//   3. "Demo — All Healthy"                -> control group, should NOT flag
// Plus 2 cold leads (no follow-up in 10+ days) to populate that briefing item.
//
// SAFE TO RE-RUN: matches by email first: existing demo records are left
// alone rather than duplicated (booking/workout/nutrition history is only
// (re)seeded for a freshly-created client, not appended to an existing one).
//
// USAGE (run from backend/, with DATABASE_URL pointing at your real DB):
//   node prisma/seedInsightsDemo.js
// ═══════════════════════════════════════════════════════════════════════
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

async function findCoach() {
  const user = await prisma.user.findUnique({ where: { email: "coach@fitos-nexus.com" } });
  if (!user) throw new Error("coach@fitos-nexus.com not found — register this account in the app first, then re-run this script.");
  const coach = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!coach) throw new Error("coach@fitos-nexus.com exists but has no CoachProfile — is this account actually registered as a Coach, not a Client?");
  return coach;
}

async function upsertDemoClient(email, displayName) {
  let user = await prisma.user.findUnique({ where: { email } });
  let created = false;
  if (!user) {
    user = await prisma.user.create({
      data: { email, passwordHash: null, role: "CLIENT", emailVerified: true, isActive: true },
    });
    await prisma.clientProfile.create({ data: { userId: user.id, displayName, fitnessGoals: ["general_fitness"] } });
    created = true;
  }
  const profile = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
  return { profile, created };
}

async function linkToCoach(coachId, clientId) {
  const existing = await prisma.clientCoach.findFirst({ where: { coachId, clientId, coachingType: "training" } });
  if (existing) return existing;
  return prisma.clientCoach.create({ data: { coachId, clientId, status: "active", coachingType: "training" } });
}

async function seedBookings(clientId, coachId, { recentCount, priorCount }) {
  const bookings = [];
  // Prior 30-60 days ago: baseline bookings
  for (let i = 0; i < priorCount; i++) {
    bookings.push({ clientId, coachId, scheduledAt: daysAgo(35 + i * 6), durationMinutes: 60, sessionType: "ONLINE", status: "COMPLETED" });
  }
  // Recent 0-30 days ago: current bookings (fewer = the "drop")
  for (let i = 0; i < recentCount; i++) {
    bookings.push({ clientId, coachId, scheduledAt: daysAgo(2 + i * 8), durationMinutes: 60, sessionType: "ONLINE", status: "COMPLETED" });
  }
  await prisma.booking.createMany({ data: bookings });
}

async function seedWorkout(clientId, daysSinceLast) {
  await prisma.workoutSession.create({
    data: { clientId, exerciseName: "Full Body Strength", durationSeconds: 2700, caloriesBurned: 320, reps: 10, sets: 4, completedAt: daysAgo(daysSinceLast) },
  });
}

async function seedNutrition(clientId, daysSinceLast) {
  const d = daysAgo(daysSinceLast);
  await prisma.nutritionLog.create({
    data: { clientId, date: d.toISOString().slice(0, 10), meal: "lunch", name: "Grilled chicken & rice", calories: 550, protein: 40, carbs: 55, fat: 12, source: "manual", createdAt: d },
  });
}

async function seedColdLead(coachId, name, daysSinceContact) {
  const existing = await prisma.lead.findFirst({ where: { coachId, name } });
  if (existing) return;
  await prisma.lead.create({
    data: { coachId, name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, status: "CONTACTED", source: "referral", contactedAt: daysAgo(daysSinceContact) },
  });
}

async function main() {
  const coach = await findCoach();
  console.log(`Found coach profile: ${coach.id}`);

  // ── Client 1: severe signal alone (16-day workout gap + 65% booking drop) ──
  const c1 = await upsertDemoClient("demo.severe@coachme.life", "Demo — Needs Attention (Severe)");
  await linkToCoach(coach.id, c1.profile.id);
  if (c1.created) {
    await seedBookings(c1.profile.id, coach.id, { recentCount: 1, priorCount: 6 }); // ~83% drop
    await seedWorkout(c1.profile.id, 16);
    await seedNutrition(c1.profile.id, 16);
    console.log("Seeded: Demo — Needs Attention (Severe)");
  } else console.log("Already exists, skipped: Demo — Needs Attention (Severe)");

  // ── Client 2: two moderate signals together (9-day workout gap + 20-day nutrition gap) ──
  const c2 = await upsertDemoClient("demo.moderate@coachme.life", "Demo — Needs Attention (Moderate)");
  await linkToCoach(coach.id, c2.profile.id);
  if (c2.created) {
    await seedBookings(c2.profile.id, coach.id, { recentCount: 3, priorCount: 4 }); // ~25% drop, below moderate threshold on its own
    await seedWorkout(c2.profile.id, 9);
    await seedNutrition(c2.profile.id, 20);
    console.log("Seeded: Demo — Needs Attention (Moderate)");
  } else console.log("Already exists, skipped: Demo — Needs Attention (Moderate)");

  // ── Client 3: control group — everything healthy, should NOT flag ──
  const c3 = await upsertDemoClient("demo.healthy@coachme.life", "Demo — All Healthy");
  await linkToCoach(coach.id, c3.profile.id);
  if (c3.created) {
    await seedBookings(c3.profile.id, coach.id, { recentCount: 4, priorCount: 4 }); // no drop
    await seedWorkout(c3.profile.id, 1);
    await seedNutrition(c3.profile.id, 1);
    console.log("Seeded: Demo — All Healthy");
  } else console.log("Already exists, skipped: Demo — All Healthy");

  // ── Cold leads ──
  await seedColdLead(coach.id, "Demo Cold Lead — Priya S.", 8);
  await seedColdLead(coach.id, "Demo Cold Lead — Rahul K.", 12);
  console.log("Seeded cold leads (or already existed)");

  console.log("\nDone. Refresh the Dashboard for coach@fitos-nexus.com — you should now see:");
  console.log("  - 1 severely-flagged client (fires on the workout gap alone)");
  console.log("  - 1 moderately-flagged client (fires on workout gap + nutrition gap together)");
  console.log("  - 1 healthy client that stays unflagged (proves it's not over-flagging)");
  console.log("  - 2 cold leads in the briefing");
}

main()
  .catch((e) => { console.error("Seed failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
