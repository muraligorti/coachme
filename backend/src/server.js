// ═══════════════════════════════════════════════════════════════════════
// FIT:OS NEXUS — Production Backend Server
// Express + PostgreSQL (Prisma) + Redis + JWT + RBAC
// ═══════════════════════════════════════════════════════════════════════

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import winston from "winston";

// ─── Routes ──────────────────────────────────────────────────────────
import authRoutes from "./routes/auth.js";
import coachRoutes from "./routes/coaches.js";
import clientRoutes from "./routes/clients.js";
import workoutRoutes from "./routes/workouts.js";
import leadRoutes from "./routes/leads.js";
import bookingRoutes from "./routes/bookings.js";
import reportRoutes from "./routes/reports.js";
import adminRoutes from "./routes/admin.js";
import aiRoutes from "./routes/ai.js";
import healthDataRoutes from "./routes/health-data.js";
import nutritionRoutes from "./routes/nutrition.js";

// ─── Initialize Services ────────────────────────────────────────────

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

// Auto-migrate: add missing columns to ClientProfile
(async () => {
  const cols = [
    { name: "phone", type: "TEXT" },
    { name: "notes", type: "TEXT" },
    { name: "emergencyContact", type: "TEXT" },
    { name: "address", type: "TEXT" },
    { name: "dob", type: "TEXT" },
    { name: "injuries", type: "TEXT" },
  ];
  for (const col of cols) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "ClientProfile" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`);
    } catch (e) { /* column likely exists */ }
  }
  console.log("ClientProfile schema migration: done");
})();

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

// ─── Express App ─────────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1); // Trust first proxy (Railway) so rate limiters see real client IP
const PORT = parseInt(process.env.PORT || "4000");

// ─── Security Middleware ─────────────────────────────────────────────

// Helmet: Sets security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.anthropic.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS: Only allow configured origins
app.use(cors({
  origin: [
    ...(process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
    "https://coachme.life",
    "https://www.coachme.life",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  maxAge: 86400,
}));

// Body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limiter: 100 requests per 15 minutes per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", { ip: req.ip, path: req.path });
    res.status(429).json({ error: "Too many requests. Please wait." });
  },
}));

// Request ID for tracing
app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info("request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
      requestId: req.requestId,
    });
  });
  next();
});

// ─── API Routes ──────────────────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/coaches", coachRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/workouts", workoutRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/health-data", healthDataRoutes);
app.use("/api/nutrition", nutritionRoutes);

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisOk = redis.status === "ready";
    res.json({
      status: "healthy",
      database: "connected",
      redis: redisOk ? "connected" : "disconnected",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: "unhealthy", error: err.message });
  }
});

// ─── Error Handling ──────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path,
  });

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV === "development";
  res.status(err.status || 500).json({
    error: isDev ? err.message : "Internal server error",
    ...(isDev ? { stack: err.stack } : {}),
    requestId: req.requestId,
  });
});

// ─── Graceful Shutdown ───────────────────────────────────────────────

const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Start Server ────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`FIT:OS NEXUS API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
