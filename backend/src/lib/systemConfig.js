// ═══════════════════════════════════════════════════════════════════════
// SYSTEM CONFIG — admin-editable values that used to be hardcoded
// constants (tier features/limits, specializations list). Backed by the
// SystemConfig table, with a short in-memory cache since tier-feature
// checks run on nearly every authenticated request and hitting the
// database every time would be wasteful for values that change rarely.
//
// Each key falls back to its DEFAULT (the previous hardcoded value) if
// no admin has edited it yet - nothing changes behavior on day one, it
// just becomes editable going forward.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // key -> { value, expiresAt }

// The previous hardcoded values, now just the fallback when no admin
// override exists yet.
export const DEFAULTS = {
  tierFeatures: {
    FREE:    { maxClients: 5,   aiCoaching: false, leadScoring: false, bulkUpload: false, advancedAnalytics: false, brandedApp: false, apiAccess: false },
    STARTER: { maxClients: 5,   aiCoaching: false, leadScoring: false, bulkUpload: false, advancedAnalytics: false, brandedApp: false, apiAccess: false },
    PRO:     { maxClients: 50,  aiCoaching: true,  leadScoring: true,  bulkUpload: true,  advancedAnalytics: true,  brandedApp: false, apiAccess: false },
    ELITE:   { maxClients: 999, aiCoaching: true,  leadScoring: true,  bulkUpload: true,  advancedAnalytics: true,  brandedApp: true,  apiAccess: true  },
    PREMIUM: { maxClients: 999, aiCoaching: true,  leadScoring: false, bulkUpload: false, advancedAnalytics: true,  brandedApp: false, apiAccess: false },
  },
  specializations: [
    { v: "strength", l: "💪 Strength" }, { v: "yoga", l: "🧘 Yoga" }, { v: "pilates", l: "🤸 Pilates" },
    { v: "crossfit", l: "🏋️ CrossFit" }, { v: "general", l: "✨ General" },
  ],
};

export async function getConfig(key) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await prisma.systemConfig.findUnique({ where: { key } });
  const value = row ? row.value : DEFAULTS[key];
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function setConfig(key, value, adminUserId) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown config key: ${key}`);
  await prisma.systemConfig.upsert({
    where: { key },
    create: { key, value, updatedBy: adminUserId },
    update: { value, updatedBy: adminUserId },
  });
  cache.delete(key); // next read picks up the new value immediately rather than waiting out the TTL
  return value;
}

export async function getAllConfig() {
  const keys = Object.keys(DEFAULTS);
  const values = await Promise.all(keys.map(getConfig));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}
