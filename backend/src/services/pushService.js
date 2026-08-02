// ═══════════════════════════════════════════════════════════════════════
// PUSH SERVICE — registers a device's push token, and sends real
// notifications to a user's registered device(s). Every existing
// reactive notification point (bookings.js, messages.js) can call
// sendPushToUser() alongside its existing Notification.create() call to
// also deliver a real push, not just an in-app record.
// ═══════════════════════════════════════════════════════════════════════
import * as repo from "../repositories/pushRepository.js";
import { getMessaging } from "../lib/firebaseAdmin.js";
import { logger } from "../server.js";

export async function registerToken(userId, token, platform) {
  if (!token) throw new Error("token is required");
  await repo.upsertToken(userId, token, platform || "android");
  return { registered: true };
}

// Sends to every device this user has registered — a user could be
// logged in on more than one device/reinstall. Failures on individual
// tokens (e.g. one stale device) never block delivery to the others,
// and a stale token gets cleaned up automatically rather than retried
// forever.
export async function sendPushToUser(userId, { title, body, data }) {
  const messaging = getMessaging();
  if (!messaging) return { sent: 0, reason: "push not configured" }; // fails silently — see firebaseAdmin.js

  const tokens = await repo.findTokensForUser(userId);
  if (tokens.length === 0) return { sent: 0, reason: "no registered devices" };

  let sent = 0;
  await Promise.all(tokens.map(async (t) => {
    try {
      await messaging.send({
        token: t.token,
        notification: { title, body },
        data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : undefined, // FCM data payloads must be string-only
      });
      sent++;
    } catch (err) {
      const code = err?.errorInfo?.code || err?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
        await repo.deleteToken(t.token).catch(() => {}); // dead token — stop trying it
      } else {
        logger.error("Push send failed", { userId, error: err.message });
      }
    }
  }));
  return { sent, attempted: tokens.length };
}
