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
