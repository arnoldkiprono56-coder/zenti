import { Router, Response, Request } from "express";
import { db } from "@workspace/db";
import { supportRequestsTable, supportMessagesTable, usersTable, activityLogsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";

const router = Router();

const VALID_CATEGORIES = ["account_issue", "investment_query", "withdrawal_issue", "deposit_issue", "technical", "feature_request", "referral", "general", "other"];
const VALID_PRIORITIES = ["normal", "high", "urgent"];

/* ── Fraud keyword moderation ────────────────────────────────────────────── */
const FRAUD_KEYWORDS = [
  "fake", "scam", "fraud", "hack", "bypass", "cheat", "exploit",
  "bot", "automate", "multiple account", "multi account", "duplicate",
  "false referral", "fake referral", "wash", "money laundering",
  "stolen", "unauthorized", "credit card", "phish",
];

function moderateMessage(text: string): { isFlagged: boolean; flagReason: string | null } {
  const lower = text.toLowerCase();
  const matched = FRAUD_KEYWORDS.find(kw => lower.includes(kw));
  if (matched) {
    return { isFlagged: true, flagReason: `Flagged keyword: "${matched}"` };
  }
  return { isFlagged: false, flagReason: null };
}

/* ── Public: submit a support request (no auth) ──────────────────────────── */
router.post("/request", async (req: Request, res: Response) => {
  const { name, email, phone, subject, message, category, priority } = req.body;

  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: "Name, email, subject and message are required" });
    return;
  }
  if (name.length > 100 || subject.length > 200 || message.length > 5000) {
    res.status(400).json({ error: "Input exceeds maximum allowed length" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  const cat = VALID_CATEGORIES.includes(category) ? category : "general";
  const pri = VALID_PRIORITIES.includes(priority) ? priority : "normal";

  const [request] = await db.insert(supportRequestsTable).values({
    name: String(name).slice(0, 100),
    email: String(email).slice(0, 200),
    phone: phone ? String(phone).slice(0, 20) : null,
    subject: String(subject).slice(0, 200),
    message: String(message).slice(0, 5000),
    category: cat,
    priority: pri,
  }).returning();

  res.status(201).json(request);
});

/* ── Auth: submit request linked to account ──────────────────────────────── */
router.post("/request/auth", requireAuth, async (req: AuthRequest, res: Response) => {
  const { subject, message, category, priority } = req.body;
  if (!subject || !message) {
    res.status(400).json({ error: "Subject and message are required" });
    return;
  }

  const [user] = await db
    .select({ fullName: usersTable.fullName, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const cat = VALID_CATEGORIES.includes(category) ? category : "general";
  const pri = VALID_PRIORITIES.includes(priority) ? priority : "normal";

  const [request] = await db.insert(supportRequestsTable).values({
    userId: req.userId!,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    subject: String(subject).slice(0, 200),
    message: String(message).slice(0, 5000),
    category: cat,
    priority: pri,
  }).returning();

  res.status(201).json(request);
});

/* ── Chat: get my tickets ────────────────────────────────────────────────── */
router.get("/chat/my-tickets", requireAuth, async (req: AuthRequest, res: Response) => {
  const tickets = await db
    .select()
    .from(supportRequestsTable)
    .where(eq(supportRequestsTable.userId, req.userId!))
    .orderBy(desc(supportRequestsTable.updatedAt));
  res.json(tickets);
});

/* ── Chat: open a new ticket / conversation ──────────────────────────────── */
router.post("/chat/new", requireAuth, async (req: AuthRequest, res: Response) => {
  const { subject, message, category } = req.body;
  if (!subject || !message) {
    res.status(400).json({ error: "Subject and message are required" });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const moderation = moderateMessage(message);

  const cat = VALID_CATEGORIES.includes(category) ? category : "general";

  const [ticket] = await db.insert(supportRequestsTable).values({
    userId: req.userId!,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    subject: String(subject).slice(0, 200),
    message: String(message).slice(0, 2000),
    category: cat,
    priority: "normal",
  }).returning();

  await db.insert(supportMessagesTable).values({
    ticketId: ticket.id,
    userId: req.userId!,
    sender: "user",
    message: String(message).slice(0, 2000),
    isFlagged: moderation.isFlagged,
    flagReason: moderation.flagReason,
  });

  if (moderation.isFlagged) {
    await db.insert(activityLogsTable).values({
      userId: req.userId!,
      userEmail: user.email,
      action: "support_message_flagged",
      details: `Chat message flagged: ${moderation.flagReason}`,
      ipAddress: req.ip || "unknown",
    });
  }

  // Fire-and-forget: send email copy to user
  void (async () => {
    try {
      const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
      await sendEmailNotification({
        email: user.email,
        name: user.fullName,
        subject: `Your Support Request: ${ticket.subject}`,
        heading: "Support Request Received",
        body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>We've received your support request and our team will get back to you within 24 hours.</p>
<p><strong>Subject:</strong> ${ticket.subject}<br/><strong>Your message:</strong> ${message}</p>
<p>You can continue the conversation by logging into your account and visiting the Support Chat section.</p>`,
        icon: "💬",
      }, getDefaultSmtpConfig());
    } catch { /* silent */ }
  })();

  res.status(201).json({ ticket, message: "Ticket opened successfully" });
});

/* ── Chat: send a follow-up message ─────────────────────────────────────── */
router.post("/chat/:ticketId/message", requireAuth, async (req: AuthRequest, res: Response) => {
  const ticketId = parseInt(req.params.ticketId, 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const { message } = req.body;
  if (!message || String(message).trim().length === 0) {
    res.status(400).json({ error: "Message is required" });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(supportRequestsTable)
    .where(and(eq(supportRequestsTable.id, ticketId), eq(supportRequestsTable.userId as any, req.userId!)))
    .limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "resolved") {
    res.status(400).json({ error: "This conversation has been resolved. Please open a new ticket." });
    return;
  }

  const moderation = moderateMessage(String(message));

  const [msg] = await db.insert(supportMessagesTable).values({
    ticketId,
    userId: req.userId!,
    sender: "user",
    message: String(message).slice(0, 2000),
    isFlagged: moderation.isFlagged,
    flagReason: moderation.flagReason,
  }).returning();

  await db.update(supportRequestsTable)
    .set({ updatedAt: new Date(), status: "in_progress" })
    .where(eq(supportRequestsTable.id, ticketId));

  if (moderation.isFlagged) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    await db.insert(activityLogsTable).values({
      userId: req.userId!,
      userEmail: user?.email || "",
      action: "support_message_flagged",
      details: `Flagged in ticket #${ticketId}: ${moderation.flagReason}`,
      ipAddress: req.ip || "unknown",
    });
  }

  // Send email copy to user for every received message
  void (async () => {
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
      if (!user) return;
      const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
      await sendEmailNotification({
        email: user.email,
        name: user.fullName,
        subject: `Re: ${ticket.subject} — Message Sent`,
        heading: "Your Message Was Sent",
        body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>Your message has been sent to our support team.</p>
<p><strong>Your message:</strong> ${message}</p>
<p>We'll reply as soon as possible. You can view the full conversation in your support chat.</p>`,
        icon: "💬",
      }, getDefaultSmtpConfig());
    } catch { /* silent */ }
  })();

  res.status(201).json(msg);
});

/* ── Chat: get messages for a ticket ────────────────────────────────────── */
router.get("/chat/:ticketId/messages", requireAuth, async (req: AuthRequest, res: Response) => {
  const ticketId = parseInt(req.params.ticketId, 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const [ticket] = await db
    .select()
    .from(supportRequestsTable)
    .where(and(eq(supportRequestsTable.id, ticketId), eq(supportRequestsTable.userId as any, req.userId!)))
    .limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.ticketId, ticketId))
    .orderBy(supportMessagesTable.createdAt);

  res.json({ ticket, messages });
});

/* ── Admin: get all tickets ──────────────────────────────────────────────── */
router.get("/admin/tickets", requireAuth, async (req: AuthRequest, res: Response) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!caller || (caller.role !== "admin" && caller.role !== "superadmin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const statusFilter = req.query.status as string | undefined;
  const flaggedOnly = req.query.flagged === "true";

  let query = db.select({
    ticket: supportRequestsTable,
    messageCount: sql<number>`(select count(*) from support_messages where ticket_id = ${supportRequestsTable.id})::int`,
    hasFlagged: sql<boolean>`exists(select 1 from support_messages where ticket_id = ${supportRequestsTable.id} and is_flagged = true)`,
  }).from(supportRequestsTable);

  const conditions = [];
  if (statusFilter && ["open", "in_progress", "resolved"].includes(statusFilter)) {
    conditions.push(eq(supportRequestsTable.status, statusFilter as any));
  }
  if (flaggedOnly) {
    conditions.push(sql`exists(select 1 from support_messages where ticket_id = ${supportRequestsTable.id} and is_flagged = true)`);
  }

  const tickets = await (conditions.length > 0
    ? query.where(and(...conditions)).orderBy(desc(supportRequestsTable.updatedAt))
    : query.orderBy(desc(supportRequestsTable.updatedAt))
  ).limit(100);

  res.json(tickets);
});

/* ── Admin: reply to ticket ──────────────────────────────────────────────── */
router.post("/admin/tickets/:ticketId/reply", requireAuth, async (req: AuthRequest, res: Response) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!caller || (caller.role !== "admin" && caller.role !== "superadmin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const ticketId = parseInt(req.params.ticketId, 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const { message, resolve } = req.body;
  if (!message) { res.status(400).json({ error: "Message is required" }); return; }

  const [ticket] = await db.select().from(supportRequestsTable).where(eq(supportRequestsTable.id, ticketId)).limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const [msg] = await db.insert(supportMessagesTable).values({
    ticketId,
    userId: caller.id,
    sender: "admin",
    message: String(message).slice(0, 2000),
    isFlagged: false,
    flagReason: null,
  }).returning();

  const newStatus = resolve ? "resolved" : "in_progress";
  await db.update(supportRequestsTable)
    .set({ status: newStatus, adminReply: String(message).slice(0, 2000), updatedAt: new Date() })
    .where(eq(supportRequestsTable.id, ticketId));

  // Email the user the admin reply
  void (async () => {
    try {
      if (!ticket.userId) return;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, ticket.userId)).limit(1);
      if (!user) return;
      const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
      await sendEmailNotification({
        email: user.email,
        name: user.fullName,
        subject: `Reply to: ${ticket.subject}`,
        heading: "Support Team Replied",
        body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>Our support team has replied to your request.</p>
<p><strong>Support reply:</strong> ${message}</p>
${resolve ? `<p>✅ This conversation has been marked as <strong>resolved</strong>. If you need further help, please open a new support ticket.</p>` : `<p>Log in to continue the conversation in your support chat.</p>`}`,
        icon: "💬",
      }, getDefaultSmtpConfig());
    } catch { /* silent */ }
  })();

  res.status(201).json({ message: msg, status: newStatus });
});

export default router;
