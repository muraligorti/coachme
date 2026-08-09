import { Router } from "express";
import { authenticate, sanitizeBody, audit } from "../middleware/auth.js";
import * as organizationController from "../controllers/organizationController.js";

const router = Router();

router.post("/", authenticate, sanitizeBody, audit("create_organization", "organization"), organizationController.create);
router.get("/mine", authenticate, organizationController.getMine);
router.get("/:id", authenticate, organizationController.getOne);
router.patch("/:id", authenticate, sanitizeBody, audit("update_organization", "organization"), organizationController.update);

router.get("/:id/members", authenticate, organizationController.listMembers);
router.post("/:id/coaches", authenticate, sanitizeBody, audit("org_create_coach", "organization"), organizationController.createCoach);
router.delete("/:id/members/:userId", authenticate, audit("org_remove_member", "organization"), organizationController.removeMember);

router.get("/:id/coaches", authenticate, organizationController.listCoaches);
router.get("/:id/clients", authenticate, organizationController.listClients);
router.post("/:id/clients", authenticate, sanitizeBody, audit("org_create_client", "organization"), organizationController.createClient);
router.get("/:id/clients/:clientId/coaches", authenticate, organizationController.listClientCoaches);
router.post("/:id/clients/:clientId/assign", authenticate, sanitizeBody, audit("org_assign_coach", "organization"), organizationController.assignCoach);
router.post("/:id/clients/:clientId/unassign", authenticate, sanitizeBody, audit("org_unassign_coach", "organization"), organizationController.unassignCoach);

export default router;
