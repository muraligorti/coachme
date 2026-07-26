import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as habitController from "../controllers/habitController.js";

const router = Router();

router.get("/", authenticate, authorize("CLIENT"), habitController.listOwn);
router.get("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), habitController.listForClient);
router.post("/", authenticate, authorize("CLIENT"), sanitizeBody, audit("create_habit", "habit"), habitController.create);
router.delete("/:id", authenticate, authorize("CLIENT"), audit("delete_habit", "habit"), habitController.remove);
router.post("/:id/toggle", authenticate, authorize("CLIENT"), sanitizeBody, habitController.toggle);

export default router;
