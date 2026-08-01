// ═══════════════════════════════════════════════════════════════════════
// EXERCISE LIBRARY REPOSITORY — pure Prisma data access. Mounted as its
// own additive module (see routes/exerciseLibrary.js), same isolation
// strategy as booking-requests/exercise-trends this session.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId } });

// A coach sees: every global exercise tagged "general" or matching one
// of their own specializations, PLUS every exercise they've personally
// added (regardless of tag, since it's theirs).
export const findExercisesForCoach = (coachId, specializations, client = prisma) =>
  client.exercise.findMany({
    where: {
      OR: [
        { coachId },
        { coachId: null, specialization: null },
        { coachId: null, specialization: "general" },
        { coachId: null, specialization: { in: specializations.length ? specializations : ["__none__"] } },
      ],
    },
    orderBy: [{ coachId: "asc" }, { name: "asc" }], // global entries first, then this coach's own additions
  });

export const findTemplatesForCoach = (coachId, specializations, client = prisma) =>
  client.workoutTemplate.findMany({
    where: {
      OR: [
        { coachId },
        { coachId: null, specialization: null },
        { coachId: null, specialization: "general" },
        { coachId: null, specialization: { in: specializations.length ? specializations : ["__none__"] } },
      ],
    },
    orderBy: [{ coachId: "asc" }, { name: "asc" }],
  });

export const createExercise = (coachId, data, client = prisma) =>
  client.exercise.create({ data: { ...data, coachId } });

export const findExerciseById = (id, client = prisma) => client.exercise.findUnique({ where: { id } });

export const deleteExercise = (id, client = prisma) => client.exercise.delete({ where: { id } });

export const createTemplate = (coachId, data, client = prisma) =>
  client.workoutTemplate.create({ data: { ...data, coachId } });

export const findTemplateById = (id, client = prisma) => client.workoutTemplate.findUnique({ where: { id } });

export const deleteTemplate = (id, client = prisma) => client.workoutTemplate.delete({ where: { id } });

export const updateTemplate = (id, data, client = prisma) => client.workoutTemplate.update({ where: { id }, data });
