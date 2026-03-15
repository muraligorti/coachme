import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, requireFeature, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// POST /api/leads — Create a lead
router.post("/", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("create_lead", "lead"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });
    const { name, email, phone, location, fitnessGoal, source, notes, matchScore } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const lead = await prisma.lead.create({
      data: {
        coachId: coachProfile.id, name, email, phone, location, fitnessGoal,
        source: source || "manual", notes, matchScore: matchScore || 0,
      },
    });
    res.status(201).json(lead);
  } catch (err) {
    logger.error("Create lead error", { error: err.message });
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// GET /api/leads — Coach's leads
router.get("/", authenticate, authorize("COACH", "ADMIN"), requireFeature("leadScoring"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    const leads = await prisma.lead.findMany({
      where: { coachId: coachProfile.id }, orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }], take: 50,
    });
    res.json(leads);
  } catch (err) { res.status(500).json({ error: "Failed to load leads" }); }
});

// PATCH /api/leads/:id/status — Update lead status
router.patch("/:id/status", authenticate, authorize("COACH"), sanitizeBody, audit("update_lead", "lead"), async (req, res) => {
  try {
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { status: req.body.status, ...(req.body.status === "CONTACTED" ? { contactedAt: new Date() } : {}),
        ...(req.body.status === "CONVERTED" ? { convertedAt: new Date() } : {}) },
    });
    res.json(lead);
  } catch (err) { res.status(500).json({ error: "Failed to update lead" }); }
});

export default router;
