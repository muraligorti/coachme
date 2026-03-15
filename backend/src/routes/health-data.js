import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// POST /api/health-data/sync — Client syncs device data
router.post("/sync", authenticate, authorize("CLIENT"), sanitizeBody, audit("sync_health", "health"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const entries = req.body.entries || [req.body];
    const results = [];
    for (const entry of entries) {
      const record = await prisma.healthDataSync.upsert({
        where: { clientId_date_source: { clientId: clientProfile.id, date: entry.date, source: entry.source || "manual" } },
        update: { steps: entry.steps, heartRateAvg: entry.heartRateAvg, heartRateMax: entry.heartRateMax, sleepHours: entry.sleepHours, sleepQuality: entry.sleepQuality, caloriesBurned: entry.caloriesBurned, activeMinutes: entry.activeMinutes, distance: entry.distance, weight: entry.weight, spo2: entry.spo2, stressLevel: entry.stressLevel, syncedAt: new Date() },
        create: { clientId: clientProfile.id, source: entry.source || "manual", date: entry.date, steps: entry.steps, heartRateAvg: entry.heartRateAvg, heartRateMax: entry.heartRateMax, sleepHours: entry.sleepHours, sleepQuality: entry.sleepQuality, caloriesBurned: entry.caloriesBurned, activeMinutes: entry.activeMinutes, distance: entry.distance, weight: entry.weight, spo2: entry.spo2, stressLevel: entry.stressLevel },
      });
      results.push(record);
    }
    res.json({ synced: results.length, data: results });
  } catch (err) { logger.error("Health sync error", { error: err.message }); res.status(500).json({ error: "Sync failed" }); }
});

// GET /api/health-data/mine — Client's own health data
router.get("/mine", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const data = await prisma.healthDataSync.findMany({
      where: { clientId: clientProfile.id }, orderBy: { date: "desc" }, take: parseInt(req.query.limit) || 30,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: "Failed to load health data" }); }
});

// PUT /api/health-data/consent — Client updates sharing consent for their coach
router.put("/consent", authenticate, authorize("CLIENT"), sanitizeBody, async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id }, include: { coaches: { where: { status: "active" }, select: { coachId: true } } } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const coachId = req.body.coachId || clientProfile.coaches?.[0]?.coachId;
    if (!coachId) return res.status(400).json({ error: "No coach found" });
    const consent = await prisma.dataSharingConsent.upsert({
      where: { clientId_coachId: { clientId: clientProfile.id, coachId } },
      update: { shareWithCoach: req.body.shareWithCoach ?? true, metrics: req.body.metrics || {} },
      create: { clientId: clientProfile.id, coachId, shareWithCoach: req.body.shareWithCoach ?? true, metrics: req.body.metrics || { steps: true, heartRate: true, sleep: true, calories: true, spo2: true, weight: true, stress: true } },
    });
    res.json(consent);
  } catch (err) { logger.error("Consent update error", { error: err.message }); res.status(500).json({ error: "Failed to update consent" }); }
});

// GET /api/health-data/consent — Client's current consent settings
router.get("/consent", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const consents = await prisma.dataSharingConsent.findMany({ where: { clientId: clientProfile.id } });
    res.json(consents);
  } catch (err) { res.status(500).json({ error: "Failed to load consent" }); }
});

// GET /api/health-data/client/:clientId — Coach views a client's shared health data
router.get("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });
    // Verify coach-client relationship
    const relationship = await prisma.clientCoach.findUnique({
      where: { clientId_coachId: { clientId: req.params.clientId, coachId: coachProfile.id } },
    });
    if (!relationship) return res.status(403).json({ error: "Not your client" });
    // Check consent
    const consent = await prisma.dataSharingConsent.findUnique({
      where: { clientId_coachId: { clientId: req.params.clientId, coachId: coachProfile.id } },
    });
    if (!consent || !consent.shareWithCoach) return res.json({ data: [], message: "Client has not enabled data sharing" });
    // Get health data
    const data = await prisma.healthDataSync.findMany({
      where: { clientId: req.params.clientId }, orderBy: { date: "desc" }, take: parseInt(req.query.limit) || 30,
    });
    // Filter by consented metrics
    const metrics = consent.metrics || {};
    const filtered = data.map(d => {
      const out = { date: d.date, source: d.source, syncedAt: d.syncedAt };
      if (metrics.steps) { out.steps = d.steps; out.activeMinutes = d.activeMinutes; out.distance = d.distance; }
      if (metrics.heartRate) { out.heartRateAvg = d.heartRateAvg; out.heartRateMax = d.heartRateMax; }
      if (metrics.sleep) { out.sleepHours = d.sleepHours; out.sleepQuality = d.sleepQuality; }
      if (metrics.calories) out.caloriesBurned = d.caloriesBurned;
      if (metrics.spo2) out.spo2 = d.spo2;
      if (metrics.weight) out.weight = d.weight;
      if (metrics.stress) out.stressLevel = d.stressLevel;
      return out;
    });
    res.json({ data: filtered, consent: { shareWithCoach: consent.shareWithCoach, metrics } });
  } catch (err) { logger.error("Client health data error", { error: err.message }); res.status(500).json({ error: "Failed to load client data" }); }
});

export default router;
