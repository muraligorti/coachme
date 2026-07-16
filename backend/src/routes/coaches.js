import { Router } from "express";
import { prisma, redis, logger } from "../server.js";
import { authenticate, authorize, ownsResource, sanitizeBody, audit } from "../middleware/auth.js";

const router = Router();

// GET /api/coaches — Public search with filters
router.get("/", async (req, res) => {
  try {
    const { spec, city, country, priceMax, ratingMin, q, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Try cache first
    const cacheKey = `coaches:${JSON.stringify(req.query)}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const where = { user: { isActive: true } };
    if (city) where.city = city;
    if (country) where.country = country;
    if (priceMax) where.pricePerSession = { lte: parseInt(priceMax) };
    if (ratingMin) where.rating = { gte: parseFloat(ratingMin) };
    if (spec) where.specializations = { has: spec };
    if (q) {
      where.OR = [
        { displayName: { contains: q, mode: "insensitive" } },
        { bio: { contains: q, mode: "insensitive" } },
        { specializations: { has: q } },
      ];
    }

    const [coaches, total] = await Promise.all([
      prisma.coachProfile.findMany({
        where, skip, take: parseInt(limit),
        orderBy: [{ featured: "desc" }, { rating: "desc" }, { reviewCount: "desc" }],
        select: {
          id: true, displayName: true, avatar: true, bio: true, country: true, city: true,
          specializations: true, certifications: true, languages: true, experienceYears: true,
          pricePerSession: true, currency: true, sessionTypes: true, verified: true,
          featured: true, rating: true, reviewCount: true, totalClients: true, isOnline: true,
        },
      }),
      prisma.coachProfile.count({ where }),
    ]);

    const result = { coaches, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) };
    await redis.set(cacheKey, JSON.stringify(result), "EX", 300); // Cache 5 min
    res.json(result);
  } catch (err) {
    logger.error("Coach search error", { error: err.message });
    res.status(500).json({ error: "Search failed" });
  }
});

// GET /api/coaches/:id — Public profile
router.get("/:id", async (req, res) => {
  try {
    const coach = await prisma.coachProfile.findUnique({
      where: { id: req.params.id },
      include: {
        reviews: { where: { isPublic: true }, include: { client: { select: { displayName: true, avatar: true } } }, orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!coach) return res.status(404).json({ error: "Coach not found" });
    res.json(coach);
  } catch (err) {
    res.status(500).json({ error: "Failed to load coach" });
  }
});

// PUT /api/coaches/profile — Update own profile
router.put("/profile", authenticate, authorize("COACH"), sanitizeBody, audit("update_profile", "coach"), async (req, res) => {
  try {
    const profile = await prisma.coachProfile.update({
      where: { userId: req.user.id },
      data: {
        displayName: req.body.displayName,
        phone: req.body.phone,
        bio: req.body.bio,
        country: req.body.country,
        city: req.body.city,
        specializations: req.body.specializations,
        certifications: req.body.certifications,
        languages: req.body.languages,
        experienceYears: req.body.experienceYears,
        pricePerSession: req.body.pricePerSession,
        instagram: req.body.instagram,
        website: req.body.website,
        gymName: req.body.gymName,
      },
    });
    // Invalidate cache
    const keys = await redis.keys("coaches:*");
    if (keys.length) await redis.del(...keys);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
