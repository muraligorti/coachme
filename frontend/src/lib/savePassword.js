// ═══════════════════════════════════════════════════════════════════════
// SAVE PASSWORD PROMPT — Android's WebView (which Capacitor apps run in)
// does not reliably support the standard HTML autocomplete attribute for
// password-saving; Chromium explicitly removed this years ago in favor
// of apps calling the native Autofill API directly. This wraps that
// native call so the OS's actual "Save password?" dialog appears.
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";

export async function promptSavePassword(username, password) {
  if (!Capacitor.isNativePlatform() || !username || !password) return;
  try {
    const { SavePassword } = await import("@capgo/capacitor-autofill-save-password");
    await SavePassword.promptDialog({ username, password });
  } catch (e) {
    console.error("Save password prompt failed:", e.message); // never blocks login on failure - this is a nice-to-have, not core functionality
  }
}
