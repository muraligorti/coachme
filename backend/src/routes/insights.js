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

export default router;
