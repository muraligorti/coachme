// ═══════════════════════════════════════════════════════════════════════
// INSIGHTS ROUTES — pure routing table. All logic lives in
// services/insightsService.js; this file just wires paths + middleware.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import * as insightsController from "../controllers/insightsController.js";

const router = Router();

// Daily Briefing — top-priority items for the coach's Dashboard.
router.get("/briefing", authenticate, authorize("COACH", "ADMIN"), insightsController.getBriefing);

// Full risk map for every active client — powers the Clients-page badges.
router.get("/client-risks", authenticate, authorize("COACH", "ADMIN"), insightsController.getClientRisks);

// Per-coach configurable thresholds — every coach operates differently,
// so these aren't one-size-fits-all constants (see insightsService.js).
router.get("/settings", authenticate, authorize("COACH", "ADMIN"), insightsController.getSettings);
router.put("/settings", authenticate, authorize("COACH", "ADMIN"), insightsController.updateSettings);

export default router;
