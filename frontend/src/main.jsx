import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// ═══════════════════════════════════════════════════════════════════════
// STATUS BAR — on native Android, the WebView draws edge-to-edge under
// the status bar by default, and CSS `env(safe-area-inset-top)` is NOT
// reliably populated there (unlike iOS, where it works out of the box).
// That's why header content (including the sign-out button) sat too
// close to the top on Android specifically, but looked fine on web/iOS.
//
// Fix: tell Android to NOT overlay the WebView — this makes the OS
// reserve real space for the status bar outside the WebView entirely,
// so no CSS safe-area workaround is needed at all.
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
if (Capacitor.isNativePlatform()) {
  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); // light icons, matches the dark theme
    StatusBar.setBackgroundColor({ color: "#0a0e16" }).catch(() => {}); // matches Golden Hour bg
  }).catch(() => {}); // no-op if the plugin isn't available for some reason — never block app boot on this
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
