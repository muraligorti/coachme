// ═══════════════════════════════════════════════════════════════════════
// EMAIL VALIDATION — catches fake/typo domains (e.g. "yahoo1.com"),
// blocks disposable inboxes, and confirms the domain can receive mail.
// ═══════════════════════════════════════════════════════════════════════
import dns from "dns";

const resolveMx = dns.promises.resolveMx;

// Well-known providers we protect against typos of.
const KNOWN_PROVIDERS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "protonmail.com", "live.com", "rediffmail.com", "aol.com", "yandex.com",
  "zoho.com", "gmx.com",
];

// Small blocklist of common disposable/throwaway email domains.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "temp-mail.org", "guerrillamail.com",
  "10minutemail.com", "throwaway.email", "yopmail.com", "trashmail.com",
  "fakeinbox.com", "getnada.com", "sharklasers.com", "dispostable.com",
  "maildrop.cc", "mintemail.com",
]);

// Simple Levenshtein distance — used to catch near-miss typos like
// "yahoo1.com", "gmial.com", "hotmial.com" against the known list above.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Returns the well-known domain this looks like a typo of (e.g. "yahoo1.com"
// -> "yahoo.com"), or null if the domain doesn't look like a near-miss.
export function suggestDomainCorrection(domain) {
  const d = domain.toLowerCase();
  if (KNOWN_PROVIDERS.includes(d)) return null;
  for (const known of KNOWN_PROVIDERS) {
    const dist = levenshtein(d, known);
    // dist > 0 (not an exact match) and small enough to be "close" —
    // this is what flags "yahoo1.com" (dist=1 from yahoo.com).
    if (dist > 0 && dist <= 2) return known;
  }
  return null;
}

/**
 * Full server-side domain check for an email that has already passed
 * basic RFC syntax validation (e.g. via zod's .email()).
 * Returns { valid: true } or { valid: false, reason, suggestion? }.
 */
export async function validateEmailDomain(email) {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return { valid: false, reason: "Invalid email address" };

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: "Disposable or temporary email addresses are not allowed" };
  }

  const suggestion = suggestDomainCorrection(domain);
  if (suggestion) {
    return {
      valid: false,
      reason: `"${domain}" looks like a typo — did you mean @${suggestion}?`,
      suggestion,
    };
  }

  // Confirm the domain actually has a mail server. This is what catches
  // made-up-but-well-formed domains like "yahoo1.com" that aren't a typo
  // of anything on our known-providers list but still can't receive mail.
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, reason: `"${domain}" does not appear to accept email` };
    }
  } catch {
    return { valid: false, reason: `"${domain}" is not a valid or reachable email domain` };
  }

  return { valid: true };
}
