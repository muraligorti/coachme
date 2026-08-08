// ═══════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — pure routing table. Every route here is ADMIN-only,
// enforced server-side via authorize("ADMIN") — never trust a hidden
// frontend button as the only protection. All logic lives in
// services/adminService.js.
//
// THIS FILE REPLACES your previous backend/src/routes/admin.js —
// it's a superset covering user listing/filtering/pagination, user
// detail, RBAC + activate/deactivate updates, forced logout, and the
// audit log, all following the same layered pattern as auth/insights.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, authorize, audit } from "../middleware/auth.js";
import * as adminController from "../controllers/adminController.js";

const router = Router();

router.get("/users", authenticate, authorize("ADMIN"), adminController.listUsers);
router.get("/users/:id", authenticate, authorize("ADMIN"), adminController.getUser);
router.patch("/users/:id", authenticate, authorize("ADMIN"), audit("admin_update_user", "user"), adminController.updateUser);
router.patch("/users/:id/phone", authenticate, authorize("ADMIN"), audit("admin_update_phone", "user"), adminController.updatePhone);
router.delete("/users/:id", authenticate, authorize("ADMIN"), audit("admin_delete_user", "user"), adminController.deleteUser);
router.post("/users/:id/force-logout", authenticate, authorize("ADMIN"), audit("admin_force_logout", "user"), adminController.forceLogout);
router.post("/users/:id/impersonate", authenticate, authorize("ADMIN"), audit("admin_impersonate_start", "user"), adminController.impersonate);
router.get("/config", authenticate, authorize("ADMIN"), adminController.getConfig);
router.put("/config/:key", authenticate, authorize("ADMIN"), audit("admin_update_config", "system_config"), adminController.updateConfig);
router.patch("/users/:id/tier", authenticate, authorize("ADMIN"), audit("admin_set_tier", "subscription"), adminController.setTier);
router.get("/audit", authenticate, authorize("ADMIN"), adminController.getAuditLog);

export default router;
