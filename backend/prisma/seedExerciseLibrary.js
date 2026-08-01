// ═══════════════════════════════════════════════════════════════════════
// SEED: global exercise library + workout templates, across several coach
// specializations, so different coach types actually see different
// content (a Yoga coach sees yoga poses, a Strength coach sees barbell
// work, etc.) rather than one hardcoded list for everyone.
//
// Safe to re-run: matches by (name, specialization) first — existing
// entries are left alone rather than duplicated.
//
// USAGE (run from backend/, with DATABASE_URL pointing at your real DB):
//   node prisma/seedExerciseLibrary.js
// ═══════════════════════════════════════════════════════════════════════
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const EXERCISES = [
  // ── General / Strength (the original hardcoded list, now data-driven) ──
  { name: "Barbell Squat", muscleGroup: "Legs", equipment: "Barbell", specialization: "strength" },
  { name: "Bench Press", muscleGroup: "Chest", equipment: "Barbell", specialization: "strength" },
  { name: "Deadlift", muscleGroup: "Back", equipment: "Barbell", specialization: "strength" },
  { name: "Overhead Press", muscleGroup: "Shoulders", equipment: "Barbell", specialization: "strength" },
  { name: "Barbell Row", muscleGroup: "Back", equipment: "Barbell", specialization: "strength" },
  { name: "Pull-ups", muscleGroup: "Back", equipment: "Bodyweight", specialization: "general" },
  { name: "Dumbbell Curl", muscleGroup: "Biceps", equipment: "Dumbbell", specialization: "general" },
  { name: "Tricep Pushdown", muscleGroup: "Triceps", equipment: "Cable", specialization: "general" },
  { name: "Leg Press", muscleGroup: "Legs", equipment: "Machine", specialization: "general" },
  { name: "Lat Pulldown", muscleGroup: "Back", equipment: "Cable", specialization: "general" },
  { name: "Dumbbell Fly", muscleGroup: "Chest", equipment: "Dumbbell", specialization: "general" },
  { name: "Lateral Raise", muscleGroup: "Shoulders", equipment: "Dumbbell", specialization: "general" },
  { name: "Romanian Deadlift", muscleGroup: "Hamstrings", equipment: "Barbell", specialization: "strength" },
  { name: "Leg Curl", muscleGroup: "Hamstrings", equipment: "Machine", specialization: "general" },
  { name: "Calf Raise", muscleGroup: "Calves", equipment: "Machine", specialization: "general" },
  { name: "Plank", muscleGroup: "Core", equipment: "Bodyweight", specialization: "general" },
  { name: "Face Pull", muscleGroup: "Shoulders", equipment: "Cable", specialization: "general" },
  { name: "Hip Thrust", muscleGroup: "Glutes", equipment: "Barbell", specialization: "strength" },
  { name: "Incline DB Press", muscleGroup: "Chest", equipment: "Dumbbell", specialization: "general" },
  { name: "Bulgarian Split Squat", muscleGroup: "Legs", equipment: "Dumbbell", specialization: "general" },

  // ── Yoga ──
  { name: "Downward-Facing Dog", muscleGroup: "Full Body", equipment: "Mat", specialization: "yoga" },
  { name: "Warrior II", muscleGroup: "Legs", equipment: "Mat", specialization: "yoga" },
  { name: "Tree Pose", muscleGroup: "Balance/Core", equipment: "Mat", specialization: "yoga" },
  { name: "Child's Pose", muscleGroup: "Recovery", equipment: "Mat", specialization: "yoga" },
  { name: "Cobra Pose", muscleGroup: "Back/Core", equipment: "Mat", specialization: "yoga" },
  { name: "Triangle Pose", muscleGroup: "Full Body", equipment: "Mat", specialization: "yoga" },
  { name: "Seated Forward Bend", muscleGroup: "Hamstrings/Back", equipment: "Mat", specialization: "yoga" },
  { name: "Bridge Pose", muscleGroup: "Glutes/Back", equipment: "Mat", specialization: "yoga" },
  { name: "Sun Salutation Flow", muscleGroup: "Full Body", equipment: "Mat", specialization: "yoga" },

  // ── Pilates ──
  { name: "The Hundred", muscleGroup: "Core", equipment: "Mat", specialization: "pilates" },
  { name: "Roll-Up", muscleGroup: "Core", equipment: "Mat", specialization: "pilates" },
  { name: "Single Leg Circle", muscleGroup: "Core/Hips", equipment: "Mat", specialization: "pilates" },
  { name: "Swan Dive", muscleGroup: "Back", equipment: "Mat", specialization: "pilates" },
  { name: "Teaser", muscleGroup: "Core", equipment: "Mat", specialization: "pilates" },
  { name: "Side Kick Series", muscleGroup: "Hips/Legs", equipment: "Mat", specialization: "pilates" },

  // ── CrossFit ──
  { name: "Kettlebell Swing", muscleGroup: "Full Body", equipment: "Kettlebell", specialization: "crossfit" },
  { name: "Box Jump", muscleGroup: "Legs/Power", equipment: "Box", specialization: "crossfit" },
  { name: "Wall Ball", muscleGroup: "Full Body", equipment: "Medicine Ball", specialization: "crossfit" },
  { name: "Burpee", muscleGroup: "Full Body", equipment: "Bodyweight", specialization: "crossfit" },
  { name: "Clean and Jerk", muscleGroup: "Full Body/Power", equipment: "Barbell", specialization: "crossfit" },
  { name: "Snatch", muscleGroup: "Full Body/Power", equipment: "Barbell", specialization: "crossfit" },
  { name: "Rowing (Erg)", muscleGroup: "Cardio/Full Body", equipment: "Rower", specialization: "crossfit" },
  { name: "Double Unders", muscleGroup: "Cardio/Calves", equipment: "Jump Rope", specialization: "crossfit" },
];

// Each template is now a multi-day container — TEMPLATES here are kept
// as simple single-section examples (matching the previous flat
// behavior); BEGINNER_SPLIT below shows a real multi-section template,
// the actual point of this feature.
const TEMPLATES = [
  { name: "Push Day", level: "Intermediate", specialization: "strength", sections: [{ name: "Push Day", daysOfWeek: [], exercises: [{ name: "Bench Press", sets: 4, reps: 8 }, { name: "Overhead Press", sets: 3, reps: 10 }, { name: "Incline DB Press", sets: 3, reps: 10 }, { name: "Lateral Raise", sets: 3, reps: 15 }, { name: "Tricep Pushdown", sets: 3, reps: 12 }] }] },
  { name: "Pull Day", level: "Intermediate", specialization: "strength", sections: [{ name: "Pull Day", daysOfWeek: [], exercises: [{ name: "Deadlift", sets: 4, reps: 6 }, { name: "Barbell Row", sets: 4, reps: 8 }, { name: "Lat Pulldown", sets: 3, reps: 10 }, { name: "Face Pull", sets: 3, reps: 15 }, { name: "Dumbbell Curl", sets: 3, reps: 12 }] }] },
  { name: "Leg Day", level: "Intermediate", specialization: "strength", sections: [{ name: "Leg Day", daysOfWeek: [], exercises: [{ name: "Barbell Squat", sets: 4, reps: 8 }, { name: "Romanian Deadlift", sets: 3, reps: 10 }, { name: "Leg Press", sets: 3, reps: 12 }, { name: "Leg Curl", sets: 3, reps: 12 }, { name: "Calf Raise", sets: 4, reps: 15 }] }] },
  { name: "Morning Flow", level: "Beginner", specialization: "yoga", sections: [{ name: "Morning Flow", daysOfWeek: [], exercises: [{ name: "Sun Salutation Flow", sets: 3, reps: 1 }, { name: "Downward-Facing Dog", sets: 3, reps: 1 }, { name: "Warrior II", sets: 2, reps: 1 }, { name: "Child's Pose", sets: 1, reps: 1 }] }] },
  { name: "Core Foundations", level: "Beginner", specialization: "pilates", sections: [{ name: "Core Foundations", daysOfWeek: [], exercises: [{ name: "The Hundred", sets: 1, reps: 100 }, { name: "Roll-Up", sets: 3, reps: 8 }, { name: "Single Leg Circle", sets: 3, reps: 10 }] }] },
  { name: "WOD — Metcon Basics", level: "Intermediate", specialization: "crossfit", sections: [{ name: "Metcon", daysOfWeek: [], exercises: [{ name: "Kettlebell Swing", sets: 5, reps: 15 }, { name: "Box Jump", sets: 5, reps: 10 }, { name: "Burpee", sets: 5, reps: 10 }, { name: "Rowing (Erg)", sets: 1, reps: 1 }] }] },
  // A real multi-section example — the actual point of this feature.
  { name: "Full Body Beginner", level: "Beginner", specialization: "general", sections: [
    { name: "Upper Body", icon: "💪", daysOfWeek: [1, 4], exercises: [{ name: "Bench Press", sets: 3, reps: 10 }, { name: "Barbell Row", sets: 3, reps: 10 }] },
    { name: "Core", icon: "🧘", daysOfWeek: [3], exercises: [{ name: "Plank", sets: 3, reps: 30 }] },
    { name: "Legs", icon: "🦵", daysOfWeek: [5], exercises: [{ name: "Barbell Squat", sets: 3, reps: 10 }] },
  ] },
];

async function main() {
  let exCreated = 0, exSkipped = 0;
  for (const ex of EXERCISES) {
    const existing = await prisma.exercise.findFirst({ where: { name: ex.name, specialization: ex.specialization, coachId: null } });
    if (existing) { exSkipped++; continue; }
    await prisma.exercise.create({ data: { ...ex, coachId: null } });
    exCreated++;
  }
  console.log(`Exercises: ${exCreated} created, ${exSkipped} already existed`);

  // Upsert (not skip-if-exists) — a prior run of this script may have
  // created templates in the OLD flat "exercises" format, which the
  // schema no longer has a column for. Re-running now fixes those rows
  // to the new multi-section "sections" format rather than leaving them
  // broken.
  let tCreated = 0, tUpdated = 0;
  for (const t of TEMPLATES) {
    const existing = await prisma.workoutTemplate.findFirst({ where: { name: t.name, specialization: t.specialization, coachId: null } });
    if (existing) { await prisma.workoutTemplate.update({ where: { id: existing.id }, data: { sections: t.sections } }); tUpdated++; continue; }
    await prisma.workoutTemplate.create({ data: { ...t, coachId: null } });
    tCreated++;
  }
  console.log(`Templates: ${tCreated} created, ${tUpdated} updated to the new sections format`);
  console.log("\nDone. Coaches will now see exercises/templates matching their own CoachProfile.specializations, plus anything tagged 'general'.");
}

main()
  .catch((e) => { console.error("Seed failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
