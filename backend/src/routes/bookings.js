import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, ownsResource, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// POST /api/bookings — Create booking (client, coach, or admin)
router.post("/", authenticate, authorize("CLIENT", "COACH", "ADMIN"), sanitizeBody, audit("create_booking", "booking"), async (req, res) => {
  try {
    // Resolve clientId: clients use their own profile; coaches/admins must supply clientId
    let clientProfile;
    if (req.user.role === "CLIENT") {
      clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
    } else {
      if (!req.body.clientId) return res.status(400).json({ error: "clientId required when booking as coach/admin" });
      clientProfile = await prisma.clientProfile.findUnique({ where: { id: req.body.clientId } });
    }
    if (!clientProfile) return res.status(404).json({ error: "Client profile not found" });

    const coach = await prisma.coachProfile.findUnique({ where: { id: req.body.coachId } });
    if (!coach) return res.status(404).json({ error: "Coach not found" });
    const booking = await prisma.booking.create({
      data: { clientId: clientProfile.id, coachId: coach.id, scheduledAt: new Date(req.body.scheduledAt),
        durationMinutes: req.body.durationMinutes || 60, sessionType: req.body.sessionType || "ONLINE",
        price: coach.pricePerSession, currency: coach.currency, notes: req.body.notes },
    });
    // Create notification for coach
    await prisma.notification.create({
      data: { userId: coach.userId, type: "booking", title: "New Booking", body: `${clientProfile.displayName} booked a session` },
    });
    res.status(201).json(booking);
  } catch (err) { logger.error("Booking create error", { error: err.message }); res.status(500).json({ error: "Booking failed" }); }
});

// GET /api/bookings — List bookings
router.get("/", authenticate, async (req, res) => {
  try {
    const coachProfile = req.user.role === "COACH" ? await prisma.coachProfile.findUnique({ where: { userId: req.user.id } }) : null;
    const clientProfile = req.user.role === "CLIENT" ? await prisma.clientProfile.findUnique({ where: { userId: req.user.id } }) : null;
    const where = coachProfile ? { coachId: coachProfile.id } : clientProfile ? { clientId: clientProfile.id } : {};
    const bookings = await prisma.booking.findMany({
      where, orderBy: { scheduledAt: "desc" }, take: 50,
      include: { client: { select: { displayName: true } }, coach: { select: { displayName: true } } },
    });
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: "Failed to load bookings" }); }
});

// PATCH /api/bookings/:id — Update status (coach can confirm/cancel)
router.patch("/:id", authenticate, sanitizeBody, audit("update_booking", "booking"), async (req, res) => {
  try {
    const updateData = { status: req.body.status, cancelReason: req.body.cancelReason };
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    const booking = await prisma.booking.update({ where: { id: req.params.id }, data: updateData });
    res.json(booking);
  } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

export default router;
