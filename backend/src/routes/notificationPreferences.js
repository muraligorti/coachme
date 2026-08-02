import { Router } from "express";
import { authenticate, sanitizeBody } from "../middleware/auth.js";
import * as controller from "../controllers/notificationPreferenceController.js";

const router = Router();

router.get("/me", authenticate, controller.getMine);
router.put("/me", authenticate, sanitizeBody, controller.updateMine);

// Protected by a shared secret instead of user auth — this is called by
// a scheduled GitHub Actions job, not a logged-in person. Set
// REMINDER_CRON_SECRET on Railway to any random string, and use the
// exact same value as a GitHub Actions secret (see
// .github/workflows/send-reminders.yml) — if either is missing or they
// don't match, this rejects the request rather than running for anyone
// who happens to guess the URL.
function requireCronSecret(req, res, next) {
  const expected = process.env.REMINDER_CRON_SECRET;
  if (!expected) return res.status(503).json({ error: "Reminder scanning is not configured (REMINDER_CRON_SECRET not set)" });
  if (req.headers["x-cron-secret"] !== expected) return res.status(403).json({ error: "Forbidden" });
  next();
}
router.post("/run-reminders", requireCronSecret, controller.runReminders);

export default router;
