import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as checkInController from "../controllers/checkInController.js";

const router = Router();

router.post("/", authenticate, authorize("CLIENT"), sanitizeBody, audit("submit_checkin", "checkin"), checkInController.submit);
router.post("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("coach_submit_checkin", "checkin"), checkInController.submitForClient);
router.get("/", authenticate, authorize("CLIENT"), checkInController.listOwn);
router.get("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), checkInController.listForClient);

export default router;
