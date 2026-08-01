// ═══════════════════════════════════════════════════════════════════════
// EXERCISE LIBRARY SERVICE — a coach sees a library filtered to their own
// specialization (already on CoachProfile, e.g. ["yoga"] or ["strength",
// "crossfit"]) plus anything they've personally added. A coach can only
// edit/delete their OWN additions — never a global/seeded entry, and
// never another coach's custom one.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as repo from "../repositories/exerciseLibraryRepository.js";

async function getCoachProfileOrThrow(userId) {
  const coachProfile = await repo.findCoachProfileByUserId(userId);
  if (!coachProfile) throw new AppError(403, "Only coaches have an exercise library");
  return coachProfile;
}

export async function listExercises(userId) {
  const coach = await getCoachProfileOrThrow(userId);
  return repo.findExercisesForCoach(coach.id, coach.specializations || []);
}

export async function listTemplates(userId) {
  const coach = await getCoachProfileOrThrow(userId);
  return repo.findTemplatesForCoach(coach.id, coach.specializations || []);
}

export async function addExercise(userId, { name, muscleGroup, equipment, specialization }) {
  if (!name || !name.trim()) throw new AppError(400, "Exercise name is required");
  const coach = await getCoachProfileOrThrow(userId);
  return repo.createExercise(coach.id, { name: name.trim(), muscleGroup: muscleGroup || null, equipment: equipment || null, specialization: specialization || null });
}

export async function removeExercise(userId, exerciseId) {
  const coach = await getCoachProfileOrThrow(userId);
  const ex = await repo.findExerciseById(exerciseId);
  if (!ex) throw new AppError(404, "Exercise not found");
  if (ex.coachId !== coach.id) throw new AppError(403, ex.coachId === null ? "This is a shared library exercise and can't be removed" : "This isn't your exercise to remove");
  await repo.deleteExercise(exerciseId);
  return { message: "Exercise removed" };
}

export async function addTemplate(userId, { name, description, level, specialization, sections }) {
  if (!name || !name.trim()) throw new AppError(400, "Template name is required");
  if (!Array.isArray(sections) || sections.length === 0) throw new AppError(400, "A template needs at least one section");
  for (const s of sections) {
    if (!s.name || !s.name.trim()) throw new AppError(400, "Every section needs a name");
    if (!Array.isArray(s.exercises) || s.exercises.length === 0) throw new AppError(400, `Section "${s.name}" needs at least one exercise`);
    if (s.daysOfWeek && s.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new AppError(400, `Section "${s.name}" has an invalid day value`);
  }
  const coach = await getCoachProfileOrThrow(userId);
  const cleanSections = sections.map((s) => ({ name: s.name.trim(), icon: s.icon || null, daysOfWeek: s.daysOfWeek || [], exercises: s.exercises }));
  return repo.createTemplate(coach.id, { name: name.trim(), description: description || null, level: level || null, specialization: specialization || null, sections: cleanSections });
}

export async function removeTemplate(userId, templateId) {
  const coach = await getCoachProfileOrThrow(userId);
  const t = await repo.findTemplateById(templateId);
  if (!t) throw new AppError(404, "Template not found");
  if (t.coachId !== coach.id) throw new AppError(403, t.coachId === null ? "This is a shared library template and can't be removed" : "This isn't your template to remove");
  await repo.deleteTemplate(templateId);
  return { message: "Template removed" };
}

export async function updateTemplate(userId, templateId, { name, description, level, specialization, sections }) {
  if (!name || !name.trim()) throw new AppError(400, "Template name is required");
  if (!Array.isArray(sections) || sections.length === 0) throw new AppError(400, "A template needs at least one section");
  for (const s of sections) {
    if (!s.name || !s.name.trim()) throw new AppError(400, "Every section needs a name");
    if (!Array.isArray(s.exercises) || s.exercises.length === 0) throw new AppError(400, `Section "${s.name}" needs at least one exercise`);
  }
  const coach = await getCoachProfileOrThrow(userId);
  const t = await repo.findTemplateById(templateId);
  if (!t) throw new AppError(404, "Template not found");
  if (t.coachId !== coach.id) throw new AppError(403, t.coachId === null ? "This is a shared library template and can't be edited" : "This isn't your template to edit");
  const cleanSections = sections.map((s) => ({ name: s.name.trim(), icon: s.icon || null, daysOfWeek: s.daysOfWeek || [], exercises: s.exercises }));
  return repo.updateTemplate(templateId, { name: name.trim(), description: description || null, level: level || null, specialization: specialization || null, sections: cleanSections });
}
