// ═══════════════════════════════════════════════════════════════════════
// API CLIENT — every backend call in the app goes through this. Handles
// auth token attachment, 401 session-expiry, and Zod validation-error
// message formatting in one place so individual pages never need to.
// ═══════════════════════════════════════════════════════════════════════
import { API } from "./config.js";

export const api = {
  token: localStorage.getItem("cm_token"),
  onSessionExpired: null, // set by AuthContext on mount - lets a 401 anywhere actually surface to the user and clear app state, instead of silently failing wherever that particular API call happened to be made from
  setToken(t) { this.token = t; t ? localStorage.setItem("cm_token", t) : localStorage.removeItem("cm_token"); },
  async req(p, o = {}) {
    const h = { "Content-Type": "application/json", ...(o.headers || {}) };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    try {
      const r = await fetch(`${API}${p}`, { ...o, headers: h });
      if (r.status === 401 && !p.includes("/auth/")) {
        this.setToken(null);
        if (this.onSessionExpired) this.onSessionExpired();
        throw new Error("Session expired");
      }
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
      if (!r.ok) {
        let msg = d.message || d.error || r.statusText;
        if (d.details && Array.isArray(d.details)) {
          msg = d.details.map(e => `${(e.path || []).join(".")}: ${e.message}`).join(". ") || msg;
        }
        const err = new Error(msg);
        if (d.details && !Array.isArray(d.details)) err.details = d.details; // structured error payloads (e.g. { requiresVerification, email }) stay accessible to callers, not just folded into the message string
        throw err;
      }
      return d;
    } catch (e) { if (e.message.includes("Failed to fetch")) throw new Error(`Network error on ${p}`); throw e; }
  },
  get: p => api.req(p), post: (p, b) => api.req(p, { method: "POST", body: JSON.stringify(b) }),
  put: (p, b) => api.req(p, { method: "PUT", body: JSON.stringify(b) }), del: p => api.req(p, { method: "DELETE" }),
  async upload(path, formData) {
    const headers = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${API}${path}`, { method: "POST", headers, body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || res.statusText); }
    return res.json();
  },
};
