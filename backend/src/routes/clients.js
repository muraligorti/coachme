import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, checkClientLimit, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// GET /api/clients — Coach's client list
router.get("/", authenticate, authorize("COACH", "ADMIN"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });
    const links = await prisma.clientCoach.findMany({
      where: { coachId: coachProfile.id },
      include: { client: { include: { user: { select: { email: true, lastLogin: true } }, workoutSessions: { orderBy: { completedAt: "desc" }, take: 1 } } } },
      orderBy: { startDate: "desc" },
    });
    res.json(links.map(l => ({
      id: l.client.id, name: l.client.displayName, email: l.client.user?.email,
      status: l.status, startDate: l.startDate, age: l.client.age, goals: l.client.fitnessGoals,
      lastActive: l.client.workoutSessions[0]?.completedAt || null, lastLogin: l.client.user?.lastLogin,
    })));
  } catch (err) { res.status(500).json({ error: "Failed to load clients" }); }
});

// POST /api/clients — Add client (coach)
router.post("/", authenticate, authorize("COACH"), checkClientLimit, sanitizeBody, audit("add_client", "client"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    const { name, email, phone, age, goals, conditions } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email required" });
    
    const result = await prisma.$transaction(async (tx) => {
      // Check if user exists or create invite
      let user = await tx.user.findUnique({ where: { email } });
      let clientProfile;
      if (user) {
        clientProfile = await tx.clientProfile.findUnique({ where: { userId: user.id } });
      } else {
        user = await tx.user.create({ data: { email, passwordHash: "PENDING_INVITE", role: "CLIENT" } });
        clientProfile = await tx.clientProfile.create({ data: { userId: user.id, displayName: name, age, fitnessGoals: goals || [] } });
        await tx.subscription.create({ data: { userId: user.id, tier: "FREE" } });
      }
      const link = await tx.clientCoach.create({ data: { clientId: clientProfile.id, coachId: coachProfile.id } });
      await tx.coachProfile.update({ where: { id: coachProfile.id }, data: { totalClients: { increment: 1 } } });
      return { client: clientProfile, link };
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Client already linked" });
    logger.error("Add client error", { error: err.message });
    res.status(500).json({ error: "Failed to add client" });
  }
});

// POST /api/clients/bulk — Bulk upload (Pro+)
router.post("/bulk", authenticate, authorize("COACH"), sanitizeBody, audit("bulk_upload", "client"), async (req, res) => {
  try {
    const { clients: clientList } = req.body;
    if (!Array.isArray(clientList)) return res.status(400).json({ error: "Array of clients required" });
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    const results = { success: 0, failed: 0, errors: [] };
    for (const c of clientList.slice(0, 100)) {
      try {
        if (!c.name || !c.email) { results.failed++; results.errors.push(`Missing name/email for: ${c.name || "unknown"}`); continue; }
        let user = await prisma.user.findUnique({ where: { email: c.email } });
        if (!user) {
          user = await prisma.user.create({ data: { email: c.email, passwordHash: "PENDING_INVITE", role: "CLIENT" } });
          await prisma.clientProfile.create({ data: { userId: user.id, displayName: c.name, age: c.age || null, fitnessGoals: c.goals || [] } });
          await prisma.subscription.create({ data: { userId: user.id, tier: "FREE" } });
        }
        const cp = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
        await prisma.clientCoach.create({ data: { clientId: cp.id, coachId: coachProfile.id } });
        results.success++;
      } catch { results.failed++; }
    }
    res.json(results);
  } catch (err) { res.status(500).json({ error: "Bulk upload failed" }); }
});

// PUT /api/clients/:id — Edit client
router.put("/:id", authenticate, authorize("COACH", "ADMIN"), sanitizeBody, audit("edit_client", "client"), async (req, res) => {
  try {
    const { name, email, phone, age, goals, conditions, notes, emergencyContact, address, dob, gender, injuries } = req.body;
    const updated = await prisma.clientProfile.update({
      where: { id: req.params.id },
      data: {
        ...(name && { displayName: name }),
        ...(age !== undefined && { age }),
        ...(goals && { fitnessGoals: Array.isArray(goals) ? goals : [goals] }),
        ...(conditions && { medicalConditions: Array.isArray(conditions) ? conditions : [conditions] }),
        ...(notes !== undefined && { notes }),
        ...(phone !== undefined && { phone }),
        ...(emergencyContact !== undefined && { emergencyContact }),
        ...(address !== undefined && { address }),
        ...(dob !== undefined && { dob }),
        ...(gender !== undefined && { gender }),
        ...(injuries !== undefined && { injuries }),
      },
    });
    res.json(updated);
  } catch (err) {
    logger.error("Edit client error", { error: err.message });
    res.status(500).json({ error: "Failed to update client" });
  }
});

// DELETE /api/clients/:id — Remove client link
router.delete("/:id", authenticate, authorize("COACH", "ADMIN"), audit("remove_client", "client"), async (req, res) => {
  try {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
    await prisma.clientCoach.deleteMany({ where: { coachId: coachProfile.id, clientId: req.params.id } });
    await prisma.coachProfile.update({ where: { id: coachProfile.id }, data: { totalClients: { decrement: 1 } } });
    res.json({ message: "Client removed" });
  } catch (err) { res.status(500).json({ error: "Failed to remove client" }); }
});

export default router;
