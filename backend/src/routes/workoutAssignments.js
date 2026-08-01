// ═══════════════════════════════════════════════════════════════════════
// WORKOUT ASSIGNMENTS — deliberately its own path
// (/api/workout-assignments, see server.js), same additive isolation
// strategy used throughout this session for anything touching a model
// I don't have full visibility into (WorkoutPlan here).
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as workoutAssignmentController from "../controllers/workoutAssignmentController.js";

const router = Router();

router.get("/plan/:planId", authenticate, authorize("COACH", "ADMIN"), workoutAssignmentController.getAssignedClients);
router.put("/plan/:planId", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("set_workout_assignments", "workout_plan"), workoutAssignmentController.setAssignedClients);
router.get("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), workoutAssignmentController.getPlansForClient);
router.patch("/plan/:planId/client/:clientId", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("update_client_workout", "workout_plan"), workoutAssignmentController.updateClientWorkout);
router.get("/today/:clientId", authenticate, authorize("COACH", "ADMIN"), workoutAssignmentController.getTodaysWorkout);
router.get("/mine", authenticate, authorize("COACH", "ADMIN"), workoutAssignmentController.getAssignedClientIdsForCoach);
router.post("/map-template/:templateId", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("map_template", "workout_template"), workoutAssignmentController.mapTemplate);

export default router;
