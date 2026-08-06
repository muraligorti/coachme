// ═══════════════════════════════════════════════════════════════════════
// AUTH ROUTES — a pure routing table now: which path + HTTP verb + which
// middleware maps to which controller function. No business logic and no
// database access lives here anymore — see:
//   validators/authValidators.js  → input shape validation
//   services/authService.js       → business rules & orchestration
//   repositories/*.js             → actual Prisma/Redis reads & writes
//   controllers/authController.js → translates all of the above to HTTP
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { authenticate, loginLimiter, registerLimiter, verifyEmailLimiter, sanitizeBody, audit } from "../middleware/auth.js";
import * as authController from "../controllers/authController.js";

const router = Router();

router.post("/register", registerLimiter, sanitizeBody, audit("register", "user"), authController.register);
router.post("/verify-email", verifyEmailLimiter, sanitizeBody, audit("verify_email", "user"), authController.verifyEmail);
router.post("/resend-verification", registerLimiter, sanitizeBody, authController.resendVerification);
router.post("/google", sanitizeBody, audit("google_auth", "user"), authController.googleAuth);
router.post("/login", loginLimiter, sanitizeBody, audit("login", "user"), authController.login);
router.post("/logout", authenticate, audit("logout", "user"), authController.logout);
router.post("/refresh", authController.refresh);
router.get("/me", authenticate, authController.me);
router.put("/profile", authenticate, sanitizeBody, audit("update_profile", "user"), authController.updateProfile);
router.put("/username", authenticate, sanitizeBody, audit("set_username", "user"), authController.setUsername);
router.post("/forgot-password", sanitizeBody, authController.forgotPassword);
router.post("/reset-password", sanitizeBody, authController.resetPassword);

export default router;
