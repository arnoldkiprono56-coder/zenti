import { Router, Response, Request } from "express";
import { db } from "@workspace/db";
import {
  supportRequestsTable, supportMessagesTable, usersTable,
  activityLogsTable, transactionsTable, investmentsTable,
  plansTable, claimableEarningsTable, referralsTable,
} from "@workspace/db";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { generateSupportReply, type UserContext } from "../lib/gemini-support";
import { logger } from "../lib/logger";

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
  return matched
    ? { isFlagged: true, flagReason: `Flagged keyword: "${matched}"` }
    : { isFlagged: false, flagReason: null };
}

/* ── Fetch full real-time user context for AI ───────────────────────────── */
async function fetchUserContext(userId: number): Promise<UserContext | undefined> {
  try {
    // Current EAT date string (YYYY-MM-DD)
    const eatDate = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }); // gives YYYY-MM-DD

    // Fire all DB queries in parallel
    const [
      userRows,
      investmentRows,
      depositRow,
      withdrawalRow,
      recentTxRows,
      referralCountRow,
      activeReferralCountRow,
    ] = await Promise.all([
      // User
      db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1),

      // Active investments joined with plans
      db.select({
        inv: investmentsTable,
        plan: plansTable,
      })
        .from(investmentsTable)
        .innerJoin(plansTable, eq(investmentsTable.planId, plansTable.id))
        .where(and(eq(investmentsTable.userId, userId), eq(investmentsTable.status, "active"))),

      // Total deposited
      db.select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
        .from(transactionsTable)
        .where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "completed"))),

      // Total withdrawn
      db.select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
        .from(transactionsTable)
        .where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "completed"))),

      // Recent 5 transactions
      db.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.userId, userId))
        .orderBy(desc(transactionsTable.createdAt))
        .limit(5),

      // Total referrals count
      db.select({ cnt: count() })
        .from(referralsTable)
        .where(eq(referralsTable.referrerId, userId)),

      // Active referrals (referred user deposited & invested)
      db.select({ cnt: count() })
        .from(referralsTable)
        .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.isActive, true))),
    ]);

    const user = userRows[0];
    if (!user) return undefined;

    // Investment IDs for claim lookup
    const activeInvIds = investmentRows.map(r => r.inv.id);

    // Today's claimable earnings (only if there are active investments)
    const todayClaimRows = activeInvIds.length > 0
      ? await db.select()
          .from(claimableEarningsTable)
          .where(and(
            eq(claimableEarningsTable.userId, userId),
            eq(claimableEarningsTable.earningDate, eatDate),
            inArray(claimableEarningsTable.investmentId, activeInvIds),
          ))
      : [];

    // Build active investments array with days left
    const todayEAT = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Nairobi" }));

    const activeInvestments = investmentRows.map(({ inv, plan }) => {
      let daysLeft: number | null = null;
      if (inv.completesAt) {
        const endDate = new Date(inv.completesAt);
        const diffMs = endDate.getTime() - todayEAT.getTime();
        daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }
      return {
        planName: plan.name,
        isInternship: plan.isInternship,
        amountInvested: parseFloat(String(inv.amountInvested)),
        dailyEarning: parseFloat(String(inv.dailyEarning)),
        totalEarned: parseFloat(String(inv.totalEarned)),
        expectedTotal: parseFloat(String(inv.expectedTotal)),
        startedAt: inv.startedAt.toISOString().slice(0, 10),
        completesAt: inv.completesAt ? inv.completesAt.toISOString().slice(0, 10) : null,
        daysLeft,
        status: inv.status,
      };
    });

    // Build today's claims with plan names
    const planNameMap = new Map(investmentRows.map(r => [r.inv.id, r.plan.name]));
    const todayClaims = todayClaimRows.map(c => ({
      investmentId: c.investmentId,
      planName: planNameMap.get(c.investmentId) ?? "Unknown Plan",
      amount: parseFloat(String(c.amount)),
      claimed: c.claimed,
      expired: c.expired,
    }));

    const hasPendingClaimToday = todayClaims.some(c => !c.claimed && !c.expired);

    // Build recent transactions
    const recentTransactions = recentTxRows.map(tx => ({
      type: tx.type as "deposit" | "withdrawal" | "earning",
      amount: parseFloat(String(tx.amount)),
      fee: parseFloat(String(tx.fee)),
      status: tx.status,
      method: tx.method ?? null,
      reference: tx.reference ?? null,
      createdAt: tx.createdAt.toISOString(),
    }));

    return {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      accountStatus: user.status,
      bannedReason: user.bannedReason ?? null,
      joinedAt: user.createdAt.toISOString().slice(0, 10),
      registrationCountry: user.registrationCountry ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,

      balance: parseFloat(String(user.balance)),
      lockedBalance: parseFloat(String(user.lockedBalance)),
      totalEarned: parseFloat(String(user.totalEarned)),
      totalDeposited: parseFloat(String(depositRow[0]?.total ?? "0")),
      totalWithdrawn: parseFloat(String(withdrawalRow[0]?.total ?? "0")),

      activeInvestments,
      todayClaims,
      hasPendingClaimToday,
      recentTransactions,

      referralCode: user.referralCode ?? null,
      referralStatus: user.referralStatus,
      totalReferrals: Number(referralCountRow[0]?.cnt ?? 0),
      activeReferrals: Number(activeReferralCountRow[0]?.cnt ?? 0),

      isInternshipEligible: user.isInternshipEligible,
      internshipActivated: user.internshipActivated,
    };
  } catch (err) {
    logger.warn({ err, userId }, "fetchUserContext failed — proceeding without user context");
    return undefined;
  }
}

/* ── AI auto-reply helper ────────────────────────────────────────────────── */
async function triggerAiReply(ticketId: number, ticket: typeof supportRequestsTable.$inferSelect): Promise<void> {
  try {
    const messages = await db
      .select()
      .from(supportMessagesTable)
      .where(eq(supportMessagesTable.ticketId, ticketId))
      .orderBy(supportMessagesTable.createdAt);

    // Only auto-reply when the last message is from the user
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.sender !== "user") return;

    // Fetch full real-time user context
    const userCtx = ticket.userId ? await fetchUserContext(ticket.userId) : undefined;

    const aiResult = await generateSupportReply(
      {
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        message: ticket.message,
        userName: ticket.name,
        userEmail: ticket.email,
        userPhone: ticket.phone,
      },
      messages.map(m => ({ sender: m.sender, message: m.message, createdAt: m.createdAt })),
      userCtx,
    );

    if (!aiResult.reply || aiResult.confidence < 0.4) {
      logger.info({ ticketId, confidence: aiResult.confidence }, "AI support: low confidence — sending fallback and escalating");
      
      const fallbackReply = `Hi ${ticket.name.split(" ")[0]}! 😊 I've received your message. I'm currently looking into this for you, but I want to make sure I give you the most accurate information. I've escalated this to our human support team who will review it shortly!`;
      
      await db.insert(supportMessagesTable).values({
        ticketId,
        userId: null,
        sender: "admin",
        message: `🤖 *Zenti AI Assistant*\n\n${fallbackReply}`,
        isFlagged: false,
        flagReason: null,
      });

      await db.update(supportRequestsTable)
        .set({ priority: "high", updatedAt: new Date() })
        .where(eq(supportRequestsTable.id, ticketId));

      await db.insert(activityLogsTable).values({
        userId: ticket.userId ?? undefined,
        action: "ai_support_escalated",
        details: `Ticket #${ticketId}: AI confidence low (${(aiResult.confidence * 100).toFixed(0)}%) — Sent fallback & marked High Priority`,
        ipAddress: "system-ai",
      });
      return;
    }

    // Post AI reply
    const replyText = `🤖 *Zenti AI Assistant*\n\n${aiResult.reply}`;
    await db.insert(supportMessagesTable).values({
      ticketId,
      userId: null,
      sender: "admin",
      message: replyText.slice(0, 2000),
      isFlagged: false,
      flagReason: null,
    });

    const newStatus = aiResult.shouldClose ? "resolved" : "in_progress";
    await db.update(supportRequestsTable)
      .set({ 
        status: newStatus, 
        adminReply: aiResult.reply.slice(0, 2000), 
        category: aiResult.category as any,
        priority: aiResult.priority as any,
        updatedAt: new Date() 
      })
      .where(eq(supportRequestsTable.id, ticketId));

    await db.insert(activityLogsTable).values({
      userId: ticket.userId ?? undefined,
      action: "ai_support_replied",
      details: `Ticket #${ticketId}: AI replied (confidence ${(aiResult.confidence * 100).toFixed(0)}%, shouldClose=${aiResult.shouldClose}, category=${aiResult.category})`,
      ipAddress: "system-ai",
    });

    // Email user
    if (ticket.userId) {
      void (async () => {
        try {
          const [user] = await db.select().from(usersTable).where(eq(usersTable.id, ticket.userId!)).limit(1);
          if (!user) return;
          const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
          await sendEmailNotification({
            email: user.email,
            name: user.fullName,
            subject: `Reply to: ${ticket.subject}`,
            heading: "Support Reply",
            body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>Our support team has replied to your request:</p>
<blockquote style="border-left:3px solid #16a34a;padding-left:12px;color:#374151;">${aiResult.reply.replace(/\n/g, "<br/>")}</blockquote>
${aiResult.shouldClose ? `<p>✅ This conversation has been marked as <strong>resolved</strong>. If you need further help, please open a new ticket.</p>` : `<p>You can reply in your support chat if you need more help.</p>`}`,
            icon: "🤖",
          }, getDefaultSmtpConfig());
        } catch { /* silent */ }
      })();
    }

    logger.info({ ticketId, confidence: aiResult.confidence, shouldClose: aiResult.shouldClose }, "AI support: auto-reply posted");
  } catch (err) {
    logger.warn({ err, ticketId }, "AI auto-reply threw — skipping");
  }
}

/* ── Public: submit a support request (no auth) ──────────────────────────── */
router.post("/request", async (req: Request, res: Response) => {
  const { name, email, phone, subject, message, category, priority } = req.body;
  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: "Name, email, subject and message are required" }); return;
  }
  if (name.length > 100 || subject.length > 200 || message.length > 5000) {
    res.status(400).json({ error: "Input exceeds maximum allowed length" }); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address" }); return;
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

  // AI auto-reply (fire and forget)
  void triggerAiReply(request.id, request);
});

/* ── Auth: submit request linked to account ──────────────────────────────── */
router.post("/request/auth", requireAuth, async (req: AuthRequest, res: Response) => {
  const { subject, message, category, priority } = req.body;
  if (!subject || !message) {
    res.status(400).json({ error: "Subject and message are required" }); return;
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

  // AI auto-reply (fire and forget)
  void triggerAiReply(request.id, request);
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
    res.status(400).json({ error: "Subject and message are required" }); return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
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

  // Confirmation email (fire and forget)
  void (async () => {
    try {
      const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
      await sendEmailNotification({
        email: user.email,
        name: user.fullName,
        subject: `Your Support Request: ${ticket.subject}`,
        heading: "Support Request Received",
        body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>We've received your support request and our AI assistant will get back to you shortly.</p>
<p><strong>Subject:</strong> ${ticket.subject}<br/><strong>Your message:</strong> ${message}</p>
<p>You can continue the conversation by logging into your account and visiting the Support Chat section.</p>`,
        icon: "💬",
      }, getDefaultSmtpConfig());
    } catch { /* silent */ }
  })();

  // AI auto-reply with full account context
  void triggerAiReply(ticket.id, ticket);

  res.status(201).json({ ticket, message: "Ticket opened successfully" });
});

/* ── Chat: send a follow-up message ─────────────────────────────────────── */
router.post("/chat/:ticketId/message", requireAuth, async (req: AuthRequest, res: Response) => {
  const ticketId = parseInt(req.params.ticketId as string, 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const { message } = req.body;
  if (!message || String(message).trim().length === 0) {
    res.status(400).json({ error: "Message is required" }); return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" }); return;
  }

  const [ticket] = await db
    .select()
    .from(supportRequestsTable)
    .where(and(eq(supportRequestsTable.id, ticketId), eq(supportRequestsTable.userId as any, req.userId!)))
    .limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "resolved") {
    res.status(400).json({ error: "This conversation has been resolved. Please open a new ticket." }); return;
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

  // AI auto-reply with freshly fetched account context
  void triggerAiReply(ticketId, ticket);

  // Email a copy of the message to the user (as promised in frontend UI)
  void (async () => {
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
      if (!user) return;
      const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
      await sendEmailNotification({
        email: user.email,
        name: user.fullName,
        subject: `Support Message: ${ticket.subject}`,
        heading: "Message Sent",
        body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>We've received your follow-up message for ticket <strong>#${ticketId}</strong>:</p>
<blockquote style="border-left:3px solid #6366f1;padding-left:12px;color:#374151;">${String(message).replace(/\n/g, "<br/>")}</blockquote>
<p>Our AI assistant or a support agent will get back to you shortly. You can also view this conversation in your account.</p>`,
        icon: "💬",
      }, getDefaultSmtpConfig());
    } catch { /* silent */ }
  })();

  res.status(201).json(msg);
});

/* ── Chat: get messages for a ticket ────────────────────────────────────── */
router.get("/chat/:ticketId/messages", requireAuth, async (req: AuthRequest, res: Response) => {
  const ticketId = parseInt(req.params.ticketId as string, 10);
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

/* ── Admin: AI suggest reply (preview — does NOT auto-send) ─────────────── */
router.post("/admin/tickets/:ticketId/ai-suggest", requireAuth, async (req: AuthRequest, res: Response) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!caller || (caller.role !== "admin" && caller.role !== "superadmin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const ticketId = parseInt(req.params.ticketId as string, 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const [ticket] = await db.select().from(supportRequestsTable).where(eq(supportRequestsTable.id, ticketId)).limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const [messages, userCtx] = await Promise.all([
    db.select()
      .from(supportMessagesTable)
      .where(eq(supportMessagesTable.ticketId, ticketId))
      .orderBy(supportMessagesTable.createdAt),
    ticket.userId ? fetchUserContext(ticket.userId) : Promise.resolve(undefined),
  ]);

  const aiResult = await generateSupportReply(
    {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      message: ticket.message,
      userName: ticket.name,
      userEmail: ticket.email,
      userPhone: ticket.phone,
    },
    messages.map(m => ({ sender: m.sender, message: m.message, createdAt: m.createdAt })),
    userCtx,
  );

  res.json(aiResult);
});

/* ── Admin: reply to ticket ──────────────────────────────────────────────── */
router.post("/admin/tickets/:ticketId/reply", requireAuth, async (req: AuthRequest, res: Response) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!caller || (caller.role !== "admin" && caller.role !== "superadmin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const ticketId = parseInt(req.params.ticketId as string, 10);
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

  // Email user the admin reply
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
