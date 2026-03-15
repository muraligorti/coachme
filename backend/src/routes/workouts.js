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
