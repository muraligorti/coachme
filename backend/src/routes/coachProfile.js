// ═══════════════════════════════════════════════════════════════════════
// COACH PROFILE — deliberately its own path (/api/coach-profile, see
// server.js), same additive isolation strategy used throughout this
// session. Covers a coach's own specialization (settable by them) and
// tier (visible, but only an admin can change it — see routes/admin.js).
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as coachProfileController from "../controllers/coachProfileController.js";

const router = Router();

router.get("/me", authenticate, authorize("COACH", "ADMIN"), coachProfileController.getMyProfile);
router.put("/specializations", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("set_specializations", "coach_profile"), coachProfileController.setMySpecializations);

export default router;
