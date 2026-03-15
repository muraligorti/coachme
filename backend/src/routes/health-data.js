import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// POST /api/health-data/sync — Client syncs device data
router.post("/sync", authenticate, authorize("CLIENT"), sanitizeBody, audit("sync_health", "health"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const entries = req.body.entries || [req.body];
    const results = [];
    for (const entry of entries) {
      const record = await prisma.healthDataSync.upsert({
        where: { clientId_date_source: { clientId: clientProfile.id, date: entry.date, source: entry.source || "manual" } },
        update: { steps: entry.steps, heartRateAvg: entry.heartRateAvg, heartRateMax: entry.heartRateMax, sleepHours: entry.sleepHours, sleepQuality: entry.sleepQuality, caloriesBurned: entry.caloriesBurned, activeMinutes: entry.activeMinutes, distance: entry.distance, weight: entry.weight, spo2: entry.spo2, stressLevel: entry.stressLevel, syncedAt: new Date() },
        create: { clientId: clientProfile.id, source: entry.source || "manual", date: entry.date, steps: entry.steps, heartRateAvg: entry.heartRateAvg, heartRateMax: entry.heartRateMax, sleepHours: entry.sleepHours, sleepQuality: entry.sleepQuality, caloriesBurned: entry.caloriesBurned, activeMinutes: entry.activeMinutes, distance: entry.distance, weight: entry.weight, spo2: entry.spo2, stressLevel: entry.stressLevel },
      });
      results.push(record);
    }
    res.json({ synced: results.length, data: results });
  } catch (err) { logger.error("Health sync error", { error: err.message }); res.status(500).json({ error: "Sync failed" }); }
});

// GET /api/health-data/mine — Client's own health data
router.get("/mine", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.json([]);
    const data = await prisma.healthDataSync.findMany({
      where: { clientId: clientProfile.id }, orderBy: { date: "desc" }, take: parseInt(req.query.limit) || 30,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: "Failed to load health data" }); }
});

// PUT /api/health-data/consent — Client updates sharing consent for their coach
router.put("/consent", authenticate, authorize("CLIENT"), sanitizeBody, async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id }, include: { coaches: { where: { status: "active" }, select: { coachId: true } } } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const coachId = req.body.coachId || clientProfile.coaches?.[0]?.coachId;
    if (!coachId) return res.status(400).json({ error: "No coach found" });
    const consent = await prisma.dataSharingConsent.upsert({
      where: { clientId_coachId: { clientId: clientProfile.id, coachId } },
      update: { shareWithCoach: req.body.shareWithCoach ?? true, metrics: req.body.metrics || {} },
      create: { clientId: clientProfile.id, coachId, shareWithCoach: req.body.shareWithCoach ?? true, metrics: req.body.metrics || { steps: true, heartRate: true, sleep: true, calories: true, spo2: true, weight: true, stress: true } },
    });
    res.json(consent);
  } catch (err) { logger.error("Consent update error", { error: err.message }); res.status(500).json({ error: "Failed to update consent" }); }
});

// GET /api/health-data/consent — Client's current consent settings
router.get("/consent", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const consents = await prisma.dataSharingConsent.findMany({ where: { clientId: clientProfile.id } });
    res.json(consents);
  } catch (err) { res.status(500).json({ error: "Failed to load consent" }); }
});

// GET /api/health-data/client/:clientId — Coach views a client's shared health data
router.get("/client/:clientId", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });
    // Verify coach-client relationship
    const relationship = await prisma.clientCoach.findUnique({
      where: { clientId_coachId: { clientId: req.params.clientId, coachId: coachProfile.id } },
    });
    if (!relationship) return res.status(403).json({ error: "Not your client" });
    // Check consent
    const consent = await prisma.dataSharingConsent.findUnique({
      where: { clientId_coachId: { clientId: req.params.clientId, coachId: coachProfile.id } },
    });
    if (!consent || !consent.shareWithCoach) return res.json({ data: [], message: "Client has not enabled data sharing" });
    // Get health data
    const data = await prisma.healthDataSync.findMany({
      where: { clientId: req.params.clientId }, orderBy: { date: "desc" }, take: parseInt(req.query.limit) || 30,
    });
    // Filter by consented metrics
    const metrics = consent.metrics || {};
    const filtered = data.map(d => {
      const out = { date: d.date, source: d.source, syncedAt: d.syncedAt };
      if (metrics.steps) { out.steps = d.steps; out.activeMinutes = d.activeMinutes; out.distance = d.distance; }
      if (metrics.heartRate) { out.heartRateAvg = d.heartRateAvg; out.heartRateMax = d.heartRateMax; }
      if (metrics.sleep) { out.sleepHours = d.sleepHours; out.sleepQuality = d.sleepQuality; }
      if (metrics.calories) out.caloriesBurned = d.caloriesBurned;
      if (metrics.spo2) out.spo2 = d.spo2;
      if (metrics.weight) out.weight = d.weight;
      if (metrics.stress) out.stressLevel = d.stressLevel;
      return out;
    });
    res.json({ data: filtered, consent: { shareWithCoach: consent.shareWithCoach, metrics } });
  } catch (err) { logger.error("Client health data error", { error: err.message }); res.status(500).json({ error: "Failed to load client data" }); }
});

// ── OAUTH CONFIG ──
const OAUTH_CONFIG = {
  fitbit: {
    authUrl: "https://www.fitbit.com/oauth2/authorize",
    tokenUrl: "https://api.fitbit.com/oauth2/token",
    dataUrl: "https://api.fitbit.com/1/user/-",
    clientId: process.env.FITBIT_CLIENT_ID,
    clientSecret: process.env.FITBIT_CLIENT_SECRET,
    scope: "activity heartrate sleep profile weight oxygen_saturation",
  },
  googleFit: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: process.env.GOOGLE_FIT_CLIENT_ID,
    clientSecret: process.env.GOOGLE_FIT_CLIENT_SECRET,
    scope: "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.body.read",
  },
  strava: {
    authUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    dataUrl: "https://www.strava.com/api/v3",
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    scope: "activity:read_all",
  },
  huawei: {
    authUrl: "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize",
    tokenUrl: "https://oauth-login.cloud.huawei.com/oauth2/v3/token",
    dataUrl: "https://health-api.cloud.huawei.com/healthkit/v1",
    clientId: process.env.HUAWEI_CLIENT_ID,
    clientSecret: process.env.HUAWEI_CLIENT_SECRET,
    scope: "https://www.huawei.com/healthkit/step.read https://www.huawei.com/healthkit/heartrate.read https://www.huawei.com/healthkit/sleep.read",
  },
};

const REDIRECT_BASE = process.env.FRONTEND_URL || "https://coachme.life";

// GET /api/health-data/oauth/:provider/start — Get OAuth URL
router.get("/oauth/:provider/start", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const provider = req.params.provider;
    const config = OAUTH_CONFIG[provider];
    if (!config) return res.status(400).json({ error: `Provider "${provider}" not supported for OAuth` });
    if (!config.clientId) return res.status(503).json({ error: `${provider} not configured. Admin needs to set ${provider.toUpperCase()}_CLIENT_ID env var.` });

    const redirectUri = `${REDIRECT_BASE}/api/health-data/oauth/${provider}/callback`;
    const state = Buffer.from(JSON.stringify({ userId: req.user.id, provider })).toString("base64url");

    let url;
    if (provider === "fitbit") {
      url = `${config.authUrl}?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(config.scope)}&state=${state}`;
    } else if (provider === "googleFit") {
      url = `${config.authUrl}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(config.scope)}&access_type=offline&prompt=consent&state=${state}`;
    } else if (provider === "strava") {
      url = `${config.authUrl}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${config.scope}&state=${state}`;
    } else if (provider === "huawei") {
      url = `${config.authUrl}?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(config.scope)}&state=${state}`;
    } else {
      url = `${config.authUrl}?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(config.scope)}&state=${state}`;
    }

    res.json({ url, provider });
  } catch (err) { logger.error("OAuth start error", { error: err.message }); res.status(500).json({ error: "OAuth start failed" }); }
});

// GET /api/health-data/oauth/:provider/callback — OAuth callback (exchanges code for token)
router.get("/oauth/:provider/callback", async (req, res) => {
  try {
    const provider = req.params.provider;
    const config = OAUTH_CONFIG[provider];
    if (!config || !req.query.code) return res.redirect(`${REDIRECT_BASE}?error=oauth_failed`);

    let stateData = {};
    try { stateData = JSON.parse(Buffer.from(req.query.state, "base64url").toString()); } catch {}
    const userId = stateData.userId;
    if (!userId) return res.redirect(`${REDIRECT_BASE}?error=invalid_state`);

    const redirectUri = `${REDIRECT_BASE}/api/health-data/oauth/${provider}/callback`;

    // Exchange code for token
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    // Fitbit requires Basic auth header
    if (provider === "fitbit") {
      headers["Authorization"] = "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    }

    const tokenRes = await fetch(config.tokenUrl, { method: "POST", headers, body: tokenBody.toString() });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      logger.error("OAuth token exchange failed", { provider, error: tokenData });
      return res.redirect(`${REDIRECT_BASE}?error=token_failed`);
    }

    // Store token
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId } });
    if (!clientProfile) return res.redirect(`${REDIRECT_BASE}?error=no_profile`);

    await prisma.deviceToken.upsert({
      where: { clientId_provider: { clientId: clientProfile.id, provider } },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        scope: tokenData.scope || null,
        providerUserId: tokenData.user_id || tokenData.athlete?.id?.toString() || null,
      },
      create: {
        clientId: clientProfile.id, provider,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        scope: tokenData.scope || null,
        providerUserId: tokenData.user_id || tokenData.athlete?.id?.toString() || null,
      },
    });

    // Redirect back to app with success
    res.redirect(`${REDIRECT_BASE}?device_connected=${provider}`);
  } catch (err) { logger.error("OAuth callback error", { error: err.message }); res.redirect(`${REDIRECT_BASE}?error=oauth_error`); }
});

// POST /api/health-data/fetch/:provider — Fetch real data using stored token
router.post("/fetch/:provider", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const provider = req.params.provider;
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });

    const token = await prisma.deviceToken.findUnique({
      where: { clientId_provider: { clientId: clientProfile.id, provider } },
    });
    if (!token) return res.status(400).json({ error: `Not connected to ${provider}. Please connect first.` });

    // Check if token expired and needs refresh
    let accessToken = token.accessToken;
    if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
      const config = OAUTH_CONFIG[provider];
      if (config) {
        try {
          const refreshBody = new URLSearchParams({
            grant_type: "refresh_token", refresh_token: token.refreshToken,
            client_id: config.clientId, client_secret: config.clientSecret,
          });
          const headers = { "Content-Type": "application/x-www-form-urlencoded" };
          if (provider === "fitbit") headers["Authorization"] = "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
          const refreshRes = await fetch(config.tokenUrl, { method: "POST", headers, body: refreshBody.toString() });
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            accessToken = refreshData.access_token;
            await prisma.deviceToken.update({
              where: { id: token.id },
              data: { accessToken, refreshToken: refreshData.refresh_token || token.refreshToken, expiresAt: refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000) : token.expiresAt },
            });
          }
        } catch (refreshErr) { logger.error("Token refresh failed", { provider, error: refreshErr.message }); }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const entries = [];

    // ── FITBIT DATA FETCH ──
    if (provider === "fitbit") {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [actRes, hrRes, sleepRes] = await Promise.all([
        fetch(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`, { headers }).then(r => r.json()).catch(() => ({})),
      ]);
      const summary = actRes?.summary || {};
      const hrZones = hrRes?.["activities-heart"]?.[0]?.value || {};
      const sleepData = sleepRes?.summary || {};
      entries.push({
        date: today, source: "fitbit",
        steps: summary.steps || null,
        caloriesBurned: summary.caloriesOut || null,
        activeMinutes: (summary.fairlyActiveMinutes || 0) + (summary.veryActiveMinutes || 0) || null,
        distance: summary.distances?.find(d => d.activity === "total")?.distance || null,
        heartRateAvg: hrZones.restingHeartRate || null,
        sleepHours: sleepData.totalMinutesAsleep ? +(sleepData.totalMinutesAsleep / 60).toFixed(1) : null,
      });
    }

    // ── GOOGLE FIT DATA FETCH ──
    if (provider === "googleFit") {
      const startTime = new Date(today + "T00:00:00").getTime() * 1000000; // nanoseconds
      const endTime = new Date(today + "T23:59:59").getTime() * 1000000;
      const body = { aggregateBy: [
        { dataTypeName: "com.google.step_count.delta" },
        { dataTypeName: "com.google.calories.expended" },
        { dataTypeName: "com.google.heart_rate.bpm" },
      ], bucketByTime: { durationMillis: 86400000 }, startTimeMillis: new Date(today).getTime(), endTimeMillis: new Date(today).getTime() + 86400000 };
      const gfRes = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then(r => r.json()).catch(() => ({}));
      const bucket = gfRes?.bucket?.[0]?.dataset || [];
      let steps = null, calories = null, hr = null;
      for (const ds of bucket) {
        for (const pt of (ds.point || [])) {
          if (pt.dataTypeName?.includes("step_count")) steps = (steps || 0) + (pt.value?.[0]?.intVal || 0);
          if (pt.dataTypeName?.includes("calories")) calories = (calories || 0) + Math.round(pt.value?.[0]?.fpVal || 0);
          if (pt.dataTypeName?.includes("heart_rate")) hr = Math.round(pt.value?.[0]?.fpVal || 0);
        }
      }
      entries.push({ date: today, source: "googleFit", steps, caloriesBurned: calories, heartRateAvg: hr });
    }

    // ── STRAVA DATA FETCH ──
    if (provider === "strava") {
      const after = Math.floor(new Date(today).getTime() / 1000);
      const activitiesRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=10`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(r => r.json()).catch(() => []);
      const activities = Array.isArray(activitiesRes) ? activitiesRes : [];
      let totalDistance = 0, totalCalories = 0, totalTime = 0, avgHr = 0, hrCount = 0;
      for (const a of activities) {
        totalDistance += a.distance || 0;
        totalCalories += a.kilojoules ? Math.round(a.kilojoules * 0.239) : 0;
        totalTime += a.moving_time || 0;
        if (a.average_heartrate) { avgHr += a.average_heartrate; hrCount++; }
      }
      entries.push({
        date: today, source: "strava",
        steps: null, distance: totalDistance > 0 ? +(totalDistance / 1000).toFixed(2) : null,
        caloriesBurned: totalCalories || null, activeMinutes: totalTime > 0 ? Math.round(totalTime / 60) : null,
        heartRateAvg: hrCount > 0 ? Math.round(avgHr / hrCount) : null,
      });
    }

    // ── HUAWEI HEALTH DATA FETCH ──
    if (provider === "huawei") {
      // Huawei Health Kit API
      const startTime = Math.floor(new Date(today + "T00:00:00").getTime() / 1000);
      const endTime = Math.floor(new Date(today + "T23:59:59").getTime() / 1000);
      const hwRes = await fetch("https://health-api.cloud.huawei.com/healthkit/v1/data/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startTime, endTime, dataTypes: ["steps", "heartRate", "sleep", "calories"] }),
      }).then(r => r.json()).catch(() => ({}));
      entries.push({
        date: today, source: "huawei",
        steps: hwRes?.steps?.total || null, heartRateAvg: hwRes?.heartRate?.average || null,
        sleepHours: hwRes?.sleep?.totalHours || null, caloriesBurned: hwRes?.calories?.total || null,
      });
    }

    // Save to DB
    const results = [];
    for (const entry of entries) {
      const record = await prisma.healthDataSync.upsert({
        where: { clientId_date_source: { clientId: clientProfile.id, date: entry.date, source: entry.source } },
        update: { ...entry, syncedAt: new Date() },
        create: { clientId: clientProfile.id, ...entry },
      });
      results.push(record);
    }

    // Update last sync time
    await prisma.deviceToken.update({ where: { id: token.id }, data: { lastSyncAt: new Date() } });

    res.json({ fetched: results.length, data: results });
  } catch (err) { logger.error("Data fetch error", { provider: req.params.provider, error: err.message }); res.status(500).json({ error: "Data fetch failed: " + err.message }); }
});

// GET /api/health-data/connections — List client's connected devices
router.get("/connections", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    const tokens = await prisma.deviceToken.findMany({
      where: { clientId: clientProfile.id },
      select: { provider: true, lastSyncAt: true, createdAt: true, expiresAt: true },
    });
    res.json(tokens);
  } catch (err) { res.status(500).json({ error: "Failed to load connections" }); }
});

// DELETE /api/health-data/disconnect/:provider — Disconnect a device
router.delete("/disconnect/:provider", authenticate, authorize("CLIENT"), async (req, res) => {
  try {
    const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });
    await prisma.deviceToken.deleteMany({ where: { clientId: clientProfile.id, provider: req.params.provider } });
    res.json({ disconnected: true });
  } catch (err) { res.status(500).json({ error: "Disconnect failed" }); }
});

export default router;
