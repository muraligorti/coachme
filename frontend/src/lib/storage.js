// ═══════════════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPER — namespaced under "cm_" to avoid clashing with
// anything else that might share the WebView's storage.
// ═══════════════════════════════════════════════════════════════════════
export const ls = {
  get(k, f = null) { try { return JSON.parse(localStorage.getItem(`cm_${k}`)) || f; } catch { return f; } },
  set(k, v) { localStorage.setItem(`cm_${k}`, JSON.stringify(v)); },
};
