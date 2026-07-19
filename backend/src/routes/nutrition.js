import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import { analyzeFoodPhoto } from "../services/nutritionPhotoService.js";
import { AppError } from "../lib/AppError.js";
const router = Router();

router.post("/analyze-photo", authenticate, authorize("CLIENT", "COACH"), sanitizeBody, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });
    const estimate = await analyzeFoodPhoto(imageBase64);
    res.json(estimate);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    logger.error("Photo analysis error", { error: err.message });
    res.status(500).json({ error: "Photo analysis failed" });
  }
});

router.post("/", authenticate, authorize("CLIENT", "COACH"), sanitizeBody, audit("log_nutrition", "nutrition"), async (req, res) => {
  try {
    let clientProfile;
    if (req.user.role === "COACH" && req.body.clientId) {
      clientProfile = await prisma.clientProfile.findUnique({ where: { id: req.body.clientId } });
    } else {
      clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    }
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });

    const loggedAt = req.body.loggedAt ? new Date(req.body.loggedAt) : new Date();
    const date = req.body.date || loggedAt.toISOString().slice(0, 10);

    const log = await prisma.nutritionLog.create({
      data: {
        clientId: clientProfile.id,
        date,
        loggedAt,
        meal: req.body.meal || "snack",
        name: req.body.name,
        calories: req.body.calories || 0,
        protein: req.body.protein || 0,
        carbs: req.body.carbs || 0,
        fat: req.body.fat || 0,
        fiber: req.body.fiber || 0,
        photoUrl: req.body.photoUrl || null,
        aiEstimated: !!req.body.aiEstimated,
        source: req.body.source || "manual",
      },
    });
    res.status(201).json(log);
  } catch (err) { logger.error("Nutrition log error", { error: err.message }); res.status(500).json({ error: "Failed to log nutrition" }); }
});

router.get("/", authenticate, async (req, res) => {
  try {
    let clientProfile;
    if (req.user.role === "COACH" || req.user.role === "ADMIN") {
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

router.get("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const where = { clientId: req.params.clientId };
    if (req.query.date) where.date = req.query.date;
    const logs = await prisma.nutritionLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: "Failed to load client nutrition" }); }
});

router.delete("/:id", authenticate, sanitizeBody, async (req, res) => {
  try {
    await prisma.nutritionLog.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

export default router;
