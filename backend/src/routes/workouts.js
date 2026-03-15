import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// POST /api/workouts/plans — Create workout plan (coach)
router.post("/plans", authenticate, authorize("COACH"), sanitizeBody, audit("create_plan", "workout"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    const plan = await prisma.workoutPlan.create({
      data: { coachId: coachProfile.id, name: req.body.name, description: req.body.description, intensity: req.body.intensity || "moderate",
        durationWeeks: req.body.durationWeeks || 4, focus: req.body.focus, exercises: req.body.exercises || [],
        weeklySchedule: req.body.weeklySchedule, aiGenerated: req.body.aiGenerated || false, isTemplate: req.body.isTemplate || false },
    });
    res.status(201).json(plan);
  } catch (err) { res.status(500).json({ error: "Failed to create plan" }); }
});

// GET /api/workouts/plans — Coach's plans
router.get("/plans", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    const plans = await prisma.workoutPlan.findMany({ where: { coachId: coachProfile.id }, orderBy: { createdAt: "desc" } });
    res.json(plans);
  } catch (err) { res.status(500).json({ error: "Failed to load plans" }); }
});

// PUT /api/workouts/plans/:id — Update workout plan (coach)
router.put("/plans/:id", authenticate, authorize("COACH"), sanitizeBody, audit("update_plan", "workout"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    const plan = await prisma.workoutPlan.findUnique({ where: { id: req.params.id } });
    if (!plan || plan.coachId !== coachProfile.id) return res.status(404).json({ error: "Plan not found" });
    const updated = await prisma.workoutPlan.update({
      where: { id: req.params.id },
      data: { name: req.body.name ?? req.body.title ?? plan.name, description: req.body.description ?? plan.description, intensity: req.body.intensity ?? plan.intensity, durationWeeks: req.body.durationWeeks ?? plan.durationWeeks, focus: req.body.focus ?? plan.focus, exercises: req.body.exercises ?? plan.exercises, weeklySchedule: req.body.weeklySchedule ?? plan.weeklySchedule, isTemplate: req.body.isTemplate ?? plan.isTemplate },
    });
    res.json(updated);
  } catch (err) { logger.error("Plan update error", { error: err.message }); res.status(500).json({ error: "Failed to update plan" }); }
});

// DELETE /api/workouts/plans/:id — Delete workout plan (coach)
router.delete("/plans/:id", authenticate, authorize("COACH"), audit("delete_plan", "workout"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    const plan = await prisma.workoutPlan.findUnique({ where: { id: req.params.id } });
    if (!plan || plan.coachId !== coachProfile.id) return res.status(404).json({ error: "Plan not found" });
    // Unlink any sessions first
    await prisma.workoutSession.updateMany({ where: { planId: req.params.id }, data: { planId: null } });
    await prisma.workoutPlan.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { logger.error("Plan delete error", { error: err.message }); res.status(500).json({ error: "Failed to delete plan" }); }
});

// POST /api/workouts/sessions — Log completed session (client or coach on behalf of client)
router.post("/sessions", authenticate, authorize("CLIENT", "COACH"), sanitizeBody, audit("log_session", "workout"), async (req, res) => {
  try {
    let clientProfile;
    if (req.user.role === "COACH" && req.body.clientId) {
      // Coach logging on behalf of a client — use provided clientId directly
      clientProfile = await prisma.clientProfile.findUnique({ where: { id: req.body.clientId } });
    } else {
      clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    }
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const session = await prisma.workoutSession.create({
      data: { clientId: clientProfile.id, planId: req.body.planId || null, exerciseName: req.body.exerciseName,
        durationSeconds: req.body.durationSeconds || 0, caloriesBurned: req.body.caloriesBurned || 0,
        formScore: req.body.formScore, reps: req.body.reps || 0, sets: req.body.sets || 0,
        intensity: req.body.intensity, heartRateAvg: req.body.heartRateAvg, heartRateMax: req.body.heartRateMax,
        fatigueLevel: req.body.fatigueLevel, cameraUsed: req.body.cameraUsed || false,
        aiCoachingUsed: req.body.aiCoachingUsed || false, xpEarned: req.body.xpEarned || 0, notes: req.body.notes },
    });
    res.status(201).json(session);
  } catch (err) { res.status(500).json({ error: "Failed to log session" }); }
});

// GET /api/workouts/sessions — Client's history
router.get("/sessions", authenticate, async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const sessions = await prisma.workoutSession.findMany({
      where: { clientId: clientProfile.id }, orderBy: { completedAt: "desc" }, take: parseInt(req.query.limit) || 50,
    });
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: "Failed to load sessions" }); }
});

export default router;
