import { Router } from "express";
import { authenticate, sanitizeBody } from "../middleware/auth.js";
import * as pushController from "../controllers/pushController.js";

const router = Router();

router.post("/register-token", authenticate, sanitizeBody, pushController.registerToken);

export default router;
