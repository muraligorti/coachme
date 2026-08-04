import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Absolute first thing this bundle does — writes directly to the same
// debug log storage used by reminder scheduling, completely independent
// of React, auth, or anything else. If this doesn't show up in the
// debug view, the problem is in the storage/logging mechanism itself
// (or how it's being viewed), not in the reminder scheduling code.
try {
  const key = "cm_local_reminders_debug_log";
  const existing = JSON.parse(localStorage.getItem(key)) || [];
  existing.unshift({ at: new Date().toISOString(), message: `App bundle executed (build check) — ${new Date().toISOString()}` });
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
} catch (e) { /* if even this fails, there's nothing more we can log from here */ }

// ═══════════════════════════════════════════════════════════════════════
// STATUS BAR — on native Android, the WebView draws edge-to-edge under
// the status bar by default, and CSS `env(safe-area-inset-top)` is NOT
// reliably populated there (unlike iOS, where it works out of the box).
// Fix: tell Android to NOT overlay the WebView — this makes the OS
// reserve real space for the status bar outside the WebView entirely.
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
if (Capacitor.isNativePlatform()) {
  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#0a0e16" }).catch(() => {});
  }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
