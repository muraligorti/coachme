// ═══════════════════════════════════════════════════════════════════════
// AUTH ROUTES — Register, Login, Logout, Refresh, Password Reset
// ═══════════════════════════════════════════════════════════════════════

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma, redis, logger } from "../server.js";
import { authenticate, loginLimiter, registerLimiter, sanitizeBody, audit } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

// ─── Validation Schemas ──────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128)
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[a-z]/, "Must contain lowercase")
    .regex(/\d/, "Must contain a number"),
  role: z.enum(["COACH", "CLIENT"]),
  profile: z.object({
    displayName: z.string().min(1).max(100),
    phone: z.string().max(30).optional(),
    country: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    // Coach-specific
    specializations: z.array(z.string().max(100)).max(10).optional(),
    certifications: z.array(z.string().max(100)).max(20).optional(),
    languages: z.array(z.string().max(50)).max(10).optional(),
    experienceYears: z.number().min(0).max(50).optional(),
    pricePerSession: z.number().min(0).max(10000).optional(),
    bio: z.string().max(2000).optional(),
    instagram: z.string().max(100).optional(),
    website: z.string().max(200).optional(),
    gymName: z.string().max(200).optional(),
    online: z.boolean().optional(),
    inPerson: z.boolean().optional(),
    // Client-specific
    age: z.number().min(13).max(120).optional(),
    gender: z.string().max(20).optional(),
    heightCm: z.number().min(50).max(300).optional(),
    weightKg: z.number().min(20).max(500).optional(),
    fitnessGoals: z.array(z.string().max(100)).max(10).optional(),
    conditions: z.array(z.string().max(100)).max(20).optional(),
  }),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

// ─── Helper: Generate Tokens ─────────────────────────────────────────

function generateTokens(user) {
  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

// ─── POST /api/auth/register ─────────────────────────────────────────

router.post("/register", registerLimiter, sanitizeBody, audit("register", "user"), async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Hash password (cost factor 12)
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user + profile + subscription in transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: data.role,
        },
      });

      // Create role-specific profile
      if (data.role === "COACH") {
        const sessionTypes = [];
        if (data.profile.online !== false) sessionTypes.push("ONLINE");
        if (data.profile.inPerson) sessionTypes.push("IN_PERSON");

        await tx.coachProfile.create({
          data: {
            userId: newUser.id,
            displayName: data.profile.displayName,
            phone: data.profile.phone || null,
            country: data.profile.country || "",
            city: data.profile.city || "",
            specializations: data.profile.specializations || [],
            certifications: data.profile.certifications || [],
            languages: data.profile.languages || ["English"],
            experienceYears: data.profile.experienceYears || 0,
            pricePerSession: data.profile.pricePerSession || 30,
            sessionTypes: sessionTypes.length ? sessionTypes : ["ONLINE"],
            bio: data.profile.bio || null,
            instagram: data.profile.instagram || null,
            website: data.profile.website || null,
            gymName: data.profile.gymName || null,
          },
        });
      } else {
        await tx.clientProfile.create({
          data: {
            userId: newUser.id,
            displayName: data.profile.displayName,
            age: data.profile.age || null,
            gender: data.profile.gender || null,
            heightCm: data.profile.heightCm || null,
            weightKg: data.profile.weightKg || null,
            country: data.profile.country || null,
            city: data.profile.city || null,
            fitnessGoals: data.profile.fitnessGoals || [],
          },
        });

        // Create encrypted medical data record if conditions provided
        if (data.profile.conditions?.length) {
          await tx.medicalData.create({
            data: {
              clientId: (await tx.clientProfile.findUnique({ where: { userId: newUser.id } })).id,
              conditionsEnc: encryptField(JSON.stringify(data.profile.conditions)),
            },
          });
        }
      }

      // Create subscription (free tier)
      await tx.subscription.create({
        data: {
          userId: newUser.id,
          tier: data.role === "COACH" ? "STARTER" : "FREE",
          maxClients: data.role === "COACH" ? 5 : 999,
        },
      });

      return newUser;
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Store session
    await prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    logger.info("User registered", { userId: user.id, role: data.role, email: data.email });

    res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: err.errors });
    }
    logger.error("Registration error", { error: err.message });
    res.status(500).json({ error: "Registration failed" });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────

router.post("/login", loginLimiter, sanitizeBody, audit("login", "user"), async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minutes.` });
    }

    // Verify password
    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      // Increment failed attempts
      const attempts = user.loginAttempts + 1;
      const lockData = attempts >= 5 ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {};
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, ...lockData },
      });
      logger.warn("Failed login attempt", { email: data.email, attempts });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Account disabled. Contact support." });
    }

    // Reset failed attempts on success
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLogin: new Date() },
    });

    const { accessToken, refreshToken } = generateTokens(user);

    // Clean old sessions (keep max 5)
    const oldSessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (oldSessions.length >= 5) {
      const toDelete = oldSessions.slice(4).map((s) => s.id);
      await prisma.session.deleteMany({ where: { id: { in: toDelete } } });
    }

    await prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Load profile
    let profile = null;
    if (user.role === "COACH") {
      profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
    } else if (user.role === "CLIENT") {
      profile = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
    }

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });

    logger.info("User logged in", { userId: user.id, role: user.role });

    res.json({
      user: { id: user.id, email: user.email, role: user.role },
      profile,
      subscription: { tier: subscription?.tier || "FREE", maxClients: subscription?.maxClients || 5 },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: err.errors });
    }
    logger.error("Login error", { error: err.message });
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────

router.post("/logout", authenticate, audit("logout", "user"), async (req, res) => {
  try {
    // Blacklist token in Redis (TTL = token expiry)
    await redis.set(`blacklist:${req.token}`, "1", "EX", 900); // 15 min

    // Delete session from DB
    await prisma.session.deleteMany({ where: { userId: req.user.id, token: req.token } });

    logger.info("User logged out", { userId: req.user.id });
    res.json({ message: "Logged out" });
  } catch (err) {
    logger.error("Logout error", { error: err.message });
    res.status(500).json({ error: "Logout failed" });
  }
});

// ─── POST /api/auth/refresh ──────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const session = await prisma.session.findUnique({ where: { refreshToken } });
    if (!session) return res.status(401).json({ error: "Invalid refresh token" });

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) return res.status(401).json({ error: "User not found" });

    // Rotate tokens
    const tokens = generateTokens(user);
    await prisma.session.update({
      where: { id: session.id },
      data: { token: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: "Token refresh failed" });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  let profile = null;
  if (user.role === "COACH") {
    profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  } else if (user.role === "CLIENT") {
    profile = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
  }

  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });

  res.json({ user, profile, subscription: { tier: subscription?.tier, maxClients: subscription?.maxClients } });
});

// ─── Helper: Encrypt medical data field ──────────────────────────────
// In production, use proper AES-256-GCM with the ENCRYPTION_KEY env var

function encryptField(plaintext) {
  // Placeholder — replace with crypto.createCipheriv in production
  return Buffer.from(plaintext).toString("base64");
}

export default router;
