// ═══════════════════════════════════════════════════════════════════════
// EXERCISE TRENDS — deliberately its own path (/api/exercise-trends, see
// server.js) rather than folded into the existing /api/workouts routes,
// same isolation strategy as booking-requests: zero risk of colliding
// with a live file I can't currently see.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import * as exerciseTrendController from "../controllers/exerciseTrendController.js";

const router = Router();

router.get("/mine/exercises", authenticate, authorize("CLIENT"), exerciseTrendController.listOwnExerciseNames);
router.get("/mine/:exerciseName/history", authenticate, authorize("CLIENT"), exerciseTrendController.getOwnHistory);
router.get("/:clientId/exercises", authenticate, authorize("CLIENT", "COACH", "ADMIN"), exerciseTrendController.listExerciseNames);
router.get("/:clientId/:exerciseName/history", authenticate, authorize("CLIENT", "COACH", "ADMIN"), exerciseTrendController.getHistory);
router.post("/:clientId/:exerciseName/compare", authenticate, authorize("COACH", "ADMIN"), exerciseTrendController.compareToLast);
router.patch("/session/:sessionId/quality", authenticate, authorize("COACH", "ADMIN"), exerciseTrendController.setSessionQuality);

export default router;
