// ═══════════════════════════════════════════════════════════════════════
// REPORTS & ANALYTICS ROUTES
// Revenue tracking, client analytics, workout stats, lead conversion
// ═══════════════════════════════════════════════════════════════════════

import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, requireFeature, audit } from "../middleware/auth.js";

const router = Router();

// ─── GET /api/reports/coach/dashboard ────────────────────────────────
// Coach's main dashboard analytics

router.get("/coach/dashboard", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });

    const coachId = coachProfile.id;
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Parallel queries for performance
    const [
      totalClients,
      activeClients,
      newClientsThisMonth,
      newClientsLastMonth,
      totalBookings,
      completedBookings,
      bookingsThisMonth,
      bookingsLastMonth,
      totalSessions,
      sessionsThisWeek,
      totalLeads,
      hotLeads,
      convertedLeads,
      reviews,
      revenueThisMonth,
      revenueLastMonth,
    ] = await Promise.all([
      prisma.clientCoach.count({ where: { coachId } }),
      prisma.clientCoach.count({ where: { coachId, status: "active" } }),
      prisma.clientCoach.count({ where: { coachId, startDate: { gte: thisMonth } } }),
      prisma.clientCoach.count({ where: { coachId, startDate: { gte: lastMonth, lt: thisMonth } } }),
      prisma.booking.count({ where: { coachId } }),
      prisma.booking.count({ where: { coachId, status: "COMPLETED" } }),
      prisma.booking.count({ where: { coachId, scheduledAt: { gte: thisMonth } } }),
      prisma.booking.count({ where: { coachId, scheduledAt: { gte: lastMonth, lt: thisMonth } } }),
      prisma.workoutPlan.count({ where: { coachId } }),
      prisma.booking.count({ where: { coachId, scheduledAt: { gte: thisWeek }, status: "COMPLETED" } }),
      prisma.lead.count({ where: { coachId } }),
      prisma.lead.count({ where: { coachId, matchScore: { gte: 80 } } }),
      prisma.lead.count({ where: { coachId, status: "CONVERTED" } }),
      prisma.review.aggregate({ where: { coachId }, _avg: { rating: true }, _count: true }),
      prisma.booking.aggregate({
        where: { coachId, scheduledAt: { gte: thisMonth }, status: { in: ["COMPLETED", "CONFIRMED"] } },
        _sum: { price: true }, _count: true,
      }),
      prisma.booking.aggregate({
        where: { coachId, scheduledAt: { gte: lastMonth, lt: thisMonth }, status: { in: ["COMPLETED", "CONFIRMED"] } },
        _sum: { price: true }, _count: true,
      }),
    ]);

    // Growth calculations
    const clientGrowth = newClientsLastMonth > 0 ? Math.round(((newClientsThisMonth - newClientsLastMonth) / newClientsLastMonth) * 100) : newClientsThisMonth > 0 ? 100 : 0;
    const bookingGrowth = bookingsLastMonth > 0 ? Math.round(((bookingsThisMonth - bookingsLastMonth) / bookingsLastMonth) * 100) : bookingsThisMonth > 0 ? 100 : 0;
    const revThisMonth = revenueThisMonth._sum.price || 0;
    const revLastMonth = revenueLastMonth._sum.price || 0;
    const revenueGrowth = revLastMonth > 0 ? Math.round(((revThisMonth - revLastMonth) / revLastMonth) * 100) : revThisMonth > 0 ? 100 : 0;
    const leadConversion = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    res.json({
      overview: {
        totalClients,
        activeClients,
        newClientsThisMonth,
        clientGrowth,
        totalBookings,
        completedBookings,
        bookingsThisMonth,
        bookingGrowth,
        sessionsThisWeek,
        totalPlans: totalSessions,
      },
      revenue: {
        thisMonth: revThisMonth,
        lastMonth: revLastMonth,
        growth: revenueGrowth,
        projected: Math.round(revThisMonth * (30 / now.getDate())),
        sessionsThisMonth: revenueThisMonth._count || 0,
      },
      leads: {
        total: totalLeads,
        hot: hotLeads,
        converted: convertedLeads,
        conversionRate: leadConversion,
      },
      ratings: {
        average: reviews._avg.rating ? Number(reviews._avg.rating.toFixed(1)) : 0,
        count: reviews._count || 0,
      },
    });
  } catch (err) {
    logger.error("Dashboard report error", { error: err.message });
    res.status(500).json({ error: "Failed to generate dashboard" });
  }
});

// ─── GET /api/reports/coach/revenue ──────────────────────────────────
// Monthly revenue breakdown

router.get("/coach/revenue", authenticate, authorize("COACH", "ADMIN"), requireFeature("advancedAnalytics"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });

    const months = parseInt(req.query.months) || 12;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const bookings = await prisma.booking.findMany({
      where: {
        coachId: coachProfile.id,
        scheduledAt: { gte: startDate },
        status: { in: ["COMPLETED", "CONFIRMED"] },
      },
      select: { price: true, scheduledAt: true, status: true },
      orderBy: { scheduledAt: "asc" },
    });

    // Group by month
    const monthlyRevenue = {};
    bookings.forEach((b) => {
      const key = `${b.scheduledAt.getFullYear()}-${String(b.scheduledAt.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyRevenue[key]) monthlyRevenue[key] = { revenue: 0, sessions: 0, completed: 0 };
      monthlyRevenue[key].revenue += b.price || 0;
      monthlyRevenue[key].sessions += 1;
      if (b.status === "COMPLETED") monthlyRevenue[key].completed += 1;
    });

    res.json({
      monthly: Object.entries(monthlyRevenue).map(([month, data]) => ({ month, ...data })),
      total: bookings.reduce((sum, b) => sum + (b.price || 0), 0),
      totalSessions: bookings.length,
    });
  } catch (err) {
    logger.error("Revenue report error", { error: err.message });
    res.status(500).json({ error: "Failed to generate revenue report" });
  }
});

// ─── GET /api/reports/coach/clients ──────────────────────────────────
// Client activity and retention report

router.get("/coach/clients", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });

    const clientLinks = await prisma.clientCoach.findMany({
      where: { coachId: coachProfile.id },
      include: {
        client: {
          include: {
            workoutSessions: { orderBy: { completedAt: "desc" }, take: 5 },
            bookings: { where: { coachId: coachProfile.id }, orderBy: { scheduledAt: "desc" }, take: 1 },
            user: { select: { email: true, lastLogin: true } },
          },
        },
      },
    });

    const clientStats = clientLinks.map((link) => {
      const c = link.client;
      const lastSession = c.workoutSessions[0];
      const lastBooking = c.bookings[0];
      const totalWorkouts = c.workoutSessions.length;
      const avgForm = totalWorkouts > 0 ? c.workoutSessions.reduce((s, w) => s + (w.formScore || 0), 0) / totalWorkouts : 0;

      // Activity scoring
      const daysSinceLastSession = lastSession ? Math.floor((Date.now() - lastSession.completedAt) / 86400000) : 999;
      const activityScore = daysSinceLastSession < 3 ? "active" : daysSinceLastSession < 14 ? "moderate" : daysSinceLastSession < 30 ? "at_risk" : "inactive";

      return {
        id: c.id,
        name: c.displayName,
        email: c.user?.email,
        status: link.status,
        startDate: link.startDate,
        totalWorkouts,
        avgFormScore: Math.round(avgForm),
        lastActive: lastSession?.completedAt || null,
        lastBooking: lastBooking?.scheduledAt || null,
        activityScore,
        daysSinceLastSession,
        fitnessGoals: c.fitnessGoals,
      };
    });

    // Summary stats
    const active = clientStats.filter((c) => c.activityScore === "active").length;
    const atRisk = clientStats.filter((c) => c.activityScore === "at_risk").length;
    const inactive = clientStats.filter((c) => c.activityScore === "inactive").length;
    const retentionRate = clientStats.length > 0 ? Math.round(((active + clientStats.filter((c) => c.activityScore === "moderate").length) / clientStats.length) * 100) : 0;

    res.json({
      clients: clientStats.sort((a, b) => a.daysSinceLastSession - b.daysSinceLastSession),
      summary: {
        total: clientStats.length,
        active,
        atRisk,
        inactive,
        retentionRate,
      },
    });
  } catch (err) {
    logger.error("Client report error", { error: err.message });
    res.status(500).json({ error: "Failed to generate client report" });
  }
});

// ─── GET /api/reports/coach/workouts ─────────────────────────────────
// Workout analytics across all clients

router.get("/coach/workouts", authenticate, authorize("COACH", "ADMIN"), requireFeature("advancedAnalytics"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });

    // Get all clients' workout sessions via coach plans
    const sessions = await prisma.workoutSession.findMany({
      where: {
        plan: { coachId: coachProfile.id },
      },
      orderBy: { completedAt: "desc" },
      take: 500,
    });

    // Aggregate stats
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((s, w) => s + Math.floor(w.durationSeconds / 60), 0);
    const totalCalories = sessions.reduce((s, w) => s + w.caloriesBurned, 0);
    const avgFormScore = totalSessions > 0 ? sessions.reduce((s, w) => s + (w.formScore || 0), 0) / totalSessions : 0;
    const cameraUsage = sessions.filter((w) => w.cameraUsed).length;
    const aiUsage = sessions.filter((w) => w.aiCoachingUsed).length;

    // By exercise type
    const byExercise = {};
    sessions.forEach((s) => {
      const name = s.exerciseName || "Unknown";
      if (!byExercise[name]) byExercise[name] = { count: 0, totalDuration: 0, avgForm: 0, totalCalories: 0 };
      byExercise[name].count += 1;
      byExercise[name].totalDuration += s.durationSeconds;
      byExercise[name].avgForm += s.formScore || 0;
      byExercise[name].totalCalories += s.caloriesBurned;
    });
    Object.values(byExercise).forEach((v) => { v.avgForm = Math.round(v.avgForm / v.count); });

    // Weekly trend (last 12 weeks)
    const weeklyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(Date.now() - (i + 1) * 7 * 86400000);
      const weekEnd = new Date(Date.now() - i * 7 * 86400000);
      const weekSessions = sessions.filter((s) => s.completedAt >= weekStart && s.completedAt < weekEnd);
      weeklyTrend.push({
        week: `W-${i}`,
        sessions: weekSessions.length,
        minutes: weekSessions.reduce((s, w) => s + Math.floor(w.durationSeconds / 60), 0),
        avgForm: weekSessions.length > 0 ? Math.round(weekSessions.reduce((s, w) => s + (w.formScore || 0), 0) / weekSessions.length) : 0,
      });
    }

    res.json({
      overview: {
        totalSessions,
        totalMinutes,
        totalCalories,
        avgFormScore: Math.round(avgFormScore),
        cameraUsageRate: totalSessions > 0 ? Math.round((cameraUsage / totalSessions) * 100) : 0,
        aiUsageRate: totalSessions > 0 ? Math.round((aiUsage / totalSessions) * 100) : 0,
      },
      byExercise: Object.entries(byExercise).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.count - a.count),
      weeklyTrend,
    });
  } catch (err) {
    logger.error("Workout report error", { error: err.message });
    res.status(500).json({ error: "Failed to generate workout report" });
  }
});

// ─── GET /api/reports/admin/platform ─────────────────────────────────
// Platform-wide analytics (admin only)

router.get("/admin/platform", authenticate, authorize("ADMIN"), audit("view_platform_report", "report"), async (req, res) => {
  try {
    const [
      totalUsers,
      totalCoaches,
      totalClients,
      activeUsers,
      totalBookings,
      totalSessions,
      revenueAll,
      subsByTier,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "COACH" } }),
      prisma.user.count({ where: { role: "CLIENT" } }),
      prisma.user.count({ where: { lastLogin: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      prisma.booking.count(),
      prisma.workoutSession.count(),
      prisma.booking.aggregate({ where: { status: "COMPLETED" }, _sum: { price: true } }),
      prisma.subscription.groupBy({ by: ["tier"], _count: true }),
    ]);

    res.json({
      users: { total: totalUsers, coaches: totalCoaches, clients: totalClients, active30d: activeUsers },
      bookings: { total: totalBookings },
      workoutSessions: { total: totalSessions },
      revenue: { totalCompleted: revenueAll._sum.price || 0 },
      subscriptions: subsByTier.map((s) => ({ tier: s.tier, count: s._count })),
    });
  } catch (err) {
    logger.error("Admin report error", { error: err.message });
    res.status(500).json({ error: "Failed to generate admin report" });
  }
});

export default router;
