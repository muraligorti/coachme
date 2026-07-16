import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// POST /api/nutrition — Log a meal (client or coach on behalf of client)
router.post("/", authenticate, authorize("CLIENT", "COACH"), sanitizeBody, audit("log_nutrition", "nutrition"), async (req, res) => {
  try {
    let clientProfile;
    if (req.user.role === "COACH" && req.body.clientId) {
      clientProfile = await prisma.clientProfile.findUnique({ where: { id: req.body.clientId } });
    } else {
      clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    }
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const log = await prisma.nutritionLog.create({
      data: { clientId: clientProfile.id, date: req.body.date || new Date().toISOString().slice(0, 10), meal: req.body.meal || "snack", name: req.body.name, calories: req.body.calories || 0, protein: req.body.protein || 0, carbs: req.body.carbs || 0, fat: req.body.fat || 0, source: req.body.source || "manual" },
    });
    res.status(201).json(log);
  } catch (err) { logger.error("Nutrition log error", { error: err.message }); res.status(500).json({ error: "Failed to log nutrition" }); }
});

// GET /api/nutrition — Client's own nutrition logs (with optional ?date= filter)
router.get("/", authenticate, async (req, res) => {
  try {
    let clientProfile;
    if (req.user.role === "COACH" || req.user.role === "ADMIN") {
      // Coach accessing — need clientId param
      if (req.query.clientId) {
        clientProfile = { id: req.query.clientId };
      } else {
        return res.json([]);
      }
    } else {
      clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    }
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const where = { clientId: clientProfile.id };
    if (req.query.date) where.date = req.query.date;
    const logs = await prisma.nutritionLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: "Failed to load nutrition data" }); }
});

// GET /api/nutrition/client/:clientId — Coach views client's nutrition logs
router.get("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const where = { clientId: req.params.clientId };
    if (req.query.date) where.date = req.query.date;
    const logs = await prisma.nutritionLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: "Failed to load client nutrition" }); }
});

// DELETE /api/nutrition/:id — Delete a nutrition log
router.delete("/:id", authenticate, sanitizeBody, async (req, res) => {
  try {
    await prisma.nutritionLog.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

export default router;
