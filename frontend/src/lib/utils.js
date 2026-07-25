// ═══════════════════════════════════════════════════════════════════════
// SHARED UTILITIES — small, pure helpers used across multiple domains.
// If a function here starts needing domain-specific knowledge, it's a
// sign it should move to that domain instead of growing here.
// ═══════════════════════════════════════════════════════════════════════

// Prefixed console logger — makes CoachMe's own logs easy to spot amid
// noisy WebView/Capacitor console output during native debugging.
export const log = (...a) => console.log("[CoachMe]", ...a);

// Unwraps the various response shapes the backend can return an array
// under (e.g. { clients: [...] } vs { data: { clients: [...] } } vs a
// bare array) into just the array itself.
export function unwrap(d, ...k) {
  for (const key of k) {
    if (d?.[key] && Array.isArray(d[key])) return d[key];
    if (d?.data?.[key] && Array.isArray(d.data[key])) return d.data[key];
  }
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

// Client display helpers — the backend returns displayName, but some
// older shapes use name/email, so these normalize across all of them.
export function cName(c) {
  return c?.displayName || c?.name || c?.user?.displayName || c?.user?.name || c?.user?.email?.split("@")[0] || "Client";
}
export function cEmail(c) { return c?.email || c?.user?.email || ""; }
export function cPhone(c) { return c?.phone || c?.user?.phone || ""; }

// Auth response extraction — different auth endpoints (register/login/
// google) have shipped slightly different response shapes over time;
// these normalize token/user extraction across all of them.
export function xToken(d) { return d?.token || d?.accessToken || d?.access_token || d?.data?.token; }
export function xUser(d) {
  const u = d?.user || d?.data?.user || d?.data || d?.profile;
  if (!u && d && (d.email || d.name || d.id)) return d;
  return u;
}

// Compresses an image file client-side before upload (used by the food-
// photo logger and profile/media uploads) — keeps payloads small enough
// for the backend's size caps without needing a server-side resize step.
export function compressImage(file, maxDim = 800, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = height * (maxDim / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = width * (maxDim / height); height = maxDim; }
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

// Local datetime-input default (accounts for timezone offset so a
// datetime-local input shows the user's actual current local time).
export const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
