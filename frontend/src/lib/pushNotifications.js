// ═══════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS — registers this device for Firebase Cloud Messaging
// push notifications and sends the resulting token to the backend so it
// knows where to deliver them. No-op entirely on web/PWA — push requires
// the native app. Never blocks anything if the user declines the
// permission or the plugin isn't available — push is additive, not core
// functionality the app depends on.
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
import { api } from "./api.js";

let initialized = false;

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform() || initialized) return;
  initialized = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== "granted") return; // respect a decline, don't nag

    // Android 8+ routes every notification through a "channel," and the
    // channel's own importance level decides whether it shows as a
    // heads-up banner or just quietly sits in the tray. Without this,
    // the plugin falls back to a default channel that isn't guaranteed
    // to be high-importance — which is exactly why reminders weren't
    // "hovering over the top" like other apps' notifications do.
    if (Capacitor.getPlatform() === "android") {
      await PushNotifications.createChannel({
        id: "reminders",
        name: "Reminders",
        description: "Session, check-in, habit, nutrition, and sync reminders",
        importance: 5, // IMPORTANCE_HIGH — required for heads-up/banner display
        visibility: 1, // VISIBILITY_PUBLIC — shows full content on the lock screen
        vibration: true,
      }).catch(() => {});
    }

    await PushNotifications.register();

    PushNotifications.addListener("registration", (token) => {
      api.post("/push/register-token", { token: token.value, platform: Capacitor.getPlatform() }).catch(() => {});
    });
    PushNotifications.addListener("registrationError", (err) => {
      console.error("Push registration failed:", err);
    });
    // Foreground delivery (app open when a push arrives) and tap-through
    // handling are left as no-ops for now — the notification still shows
    // via the OS while the app is backgrounded/closed, which covers the
    // main use case (reminders). Revisit if in-app toast-on-foreground
    // or deep-linking from a tapped notification becomes worth building.
    PushNotifications.addListener("pushNotificationReceived", () => {});
    PushNotifications.addListener("pushNotificationActionPerformed", () => {});
  } catch (e) {
    console.error("Push notifications unavailable:", e.message);
  }
}
