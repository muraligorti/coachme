// ═══════════════════════════════════════════════════════════════════════
// RBAC — feature-visibility flags and profile category. /mine is for any
// logged-in coach/client checking their own effective access; the
// /:userId routes are ADMIN-only, for actually setting it.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as rbacController from "../controllers/rbacController.js";

const router = Router();

router.get("/mine", authenticate, authorize("COACH", "CLIENT"), rbacController.getMine);
router.get("/:userId", authenticate, authorize("ADMIN"), rbacController.getForUser);
router.patch("/:userId/flags", authenticate, authorize("ADMIN"), sanitizeBody, audit("admin_set_feature_flags", "user"), rbacController.setFlags);
router.patch("/:userId/category", authenticate, authorize("ADMIN"), sanitizeBody, audit("admin_set_category", "user"), rbacController.setCategory);

export default router;
