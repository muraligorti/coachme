// ═══════════════════════════════════════════════════════════════════════
// AUTH VALIDATORS — input shape validation, isolated to one layer. Zod
// itself never leaks past this file: controllers call validateXInput()
// and get back either clean, typed data or an AppError(400, ...) with a
// human-readable message — they never need to know Zod exists.
// ═══════════════════════════════════════════════════════════════════════
import { z } from "zod";
import { AppError } from "../lib/AppError.js";

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email").max(255).transform(v => v.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/\d/, "Password must contain a number"),
  name: z.string().max(100).optional(),
  role: z.enum(["COACH", "CLIENT"]).default("CLIENT"),
  profile: z.object({
    displayName: z.string().min(1, "Name is required").max(100),
    phone: z.string().max(30).optional(),
    country: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
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
    age: z.number().min(13).max(120).optional(),
    gender: z.string().max(20).optional(),
    heightCm: z.number().min(50).max(300).optional(),
    weightKg: z.number().min(20).max(500).optional(),
    fitnessGoals: z.array(z.string().max(100)).max(10).optional(),
    conditions: z.array(z.string().max(100)).max(20).optional(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.errors.map(e => `${(e.path || []).join(".")}: ${e.message}`).join(". ");
    throw new AppError(400, messages || "Validation failed", result.error.errors);
  }
  return result.data;
}

export const validateRegisterInput = (body) => parseOrThrow(registerSchema, body);
export const validateLoginInput = (body) => parseOrThrow(loginSchema, body);
