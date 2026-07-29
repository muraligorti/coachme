// ═══════════════════════════════════════════════════════════════════════
// EXERCISE LIBRARY — deliberately its own path (/api/exercise-library,
// see server.js), same additive isolation strategy used for
// booking-requests, exercise-trends, rbac, etc. this session.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as exerciseLibraryController from "../controllers/exerciseLibraryController.js";

const router = Router();

router.get("/exercises", authenticate, authorize("COACH", "ADMIN"), exerciseLibraryController.listExercises);
router.post("/exercises", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("add_exercise", "exercise"), exerciseLibraryController.addExercise);
router.delete("/exercises/:id", authenticate, authorize("COACH", "ADMIN"), audit("remove_exercise", "exercise"), exerciseLibraryController.removeExercise);

router.get("/templates", authenticate, authorize("COACH", "ADMIN"), exerciseLibraryController.listTemplates);
router.post("/templates", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("add_template", "template"), exerciseLibraryController.addTemplate);
router.delete("/templates/:id", authenticate, authorize("COACH", "ADMIN"), audit("remove_template", "template"), exerciseLibraryController.removeTemplate);

export default router;
