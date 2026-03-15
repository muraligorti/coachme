import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, sanitizeBody, audit } from "../middleware/auth.js";
const router = Router();

// GET /api/messages — List conversations (distinct contacts)
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { id: true, email: true } },
        receiver: { select: { id: true, email: true } },
      },
    });
    // Group by conversation partner
    const convMap = new Map();
    for (const m of messages) {
      const partnerId = m.senderId === userId ? m.receiverId : m.senderId;
      if (!convMap.has(partnerId)) {
        const partner = m.senderId === userId ? m.receiver : m.sender;
        convMap.set(partnerId, { partnerId, partnerEmail: partner.email, lastMessage: m.content, lastAt: m.createdAt, unread: 0 });
      }
      if (m.receiverId === userId && !m.read) convMap.get(partnerId).unread++;
    }
    res.json([...convMap.values()]);
  } catch (err) {
    logger.error("Messages list error", { error: err.message });
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// GET /api/messages/:userId — Get messages with a specific user
router.get("/:userId", authenticate, async (req, res) => {
  try {
    const me = req.user.id;
    const them = req.params.userId;
    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: me, receiverId: them }, { senderId: them, receiverId: me }] },
      orderBy: { createdAt: "asc" },
    });
    // Mark received messages as read
    await prisma.message.updateMany({
      where: { senderId: them, receiverId: me, read: false },
      data: { read: true, readAt: new Date() },
    });
    res.json(messages);
  } catch (err) { res.status(500).json({ error: "Failed to load messages" }); }
});

// POST /api/messages — Send a message
router.post("/", authenticate, sanitizeBody, audit("send_message", "message"), async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content) return res.status(400).json({ error: "receiverId and content required" });
    const message = await prisma.message.create({
      data: { senderId: req.user.id, receiverId, content },
    });
    // Create notification
    await prisma.notification.create({
      data: { userId: receiverId, type: "message", title: "New Message", body: content.slice(0, 100) },
    }).catch(() => {});
    res.status(201).json(message);
  } catch (err) {
    logger.error("Send message error", { error: err.message });
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
