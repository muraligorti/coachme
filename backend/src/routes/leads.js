import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, requireFeature, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

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
