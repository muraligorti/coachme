// ═══════════════════════════════════════════════════════════════════════
// BOOKING REQUESTS — deliberately mounted at its OWN path
// (/api/booking-requests, see server.js) rather than folded into the
// existing /api/bookings routes, so this feature can be added without
// any risk of colliding with or needing to touch that file at all.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as bookingRequestController from "../controllers/bookingRequestController.js";

const router = Router();

router.get("/my-coaches", authenticate, authorize("CLIENT"), bookingRequestController.getMyCoaches);
router.get("/availability/:coachId", authenticate, authorize("CLIENT"), bookingRequestController.getAvailability);
router.post("/", authenticate, authorize("CLIENT"), sanitizeBody, audit("request_session", "booking"), bookingRequestController.requestSession);

export default router;
