import { Router, Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable, transactionsTable, investmentsTable,
  activityLogsTable, fraudFlagsTable, platformSettingsTable, supportRequestsTable, ticketsTable
} from "@workspace/db";
import { eq, ilike, or, sql } from "drizzle-orm";
import { requireAdmin, AuthRequest } from "../middlewares/auth";
import { serializeUser } from "./auth";
import { serializeTxn } from "./transactions";
import { serializeInvestment } from "./investments";
import { logger } from "../lib/logger";

const router = Router();

// ── Users ────────────────────────────────────────────────────────────────────

router.get("/users", requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = parseInt(String(req.query["page"] ?? "1"));
  const limit = parseInt(String(req.query["limit"] ?? "20"));
  const search = String(req.query["search"] ?? "");
  const statusRaw = Array.isArray(req.query["status"]) ? req.query["status"][0] : req.query["status"];
  const status = statusRaw ? String(statusRaw) : undefined;
  const offset = (page - 1) * limit;

  let query = db.select().from(usersTable);
  if (search) {
    query = query.where(or(ilike(usersTable.fullName, `%${search}%`), ilike(usersTable.email, `%${search}%`), ilike(usersTable.phone, `%${search}%`))) as typeof query;
  }
  if (status && ["active", "suspended", "banned"].includes(status)) {
    query = query.where(eq(usersTable.status, status as "active" | "suspended" | "banned")) as typeof query;
  }

  // Fix: count with same filters applied so pagination totals are correct
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(usersTable);
  if (search) {
    countQuery = countQuery.where(or(ilike(usersTable.fullName, `%${search}%`), ilike(usersTable.email, `%${search}%`), ilike(usersTable.phone, `%${search}%`))) as typeof countQuery;
  }
  if (status && ["active", "suspended", "banned"].includes(status)) {
    countQuery = countQuery.where(eq(usersTable.status, status as "active" | "suspended" | "banned")) as typeof countQuery;
  }
  const [countResult] = await countQuery;
  const users = await query.limit(limit).offset(offset);

  res.json({
    data: users.map(serializeUser),
    total: Number(countResult.count),
    page,
    limit,
  });
});

router.get("/users/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const investments = await db.select().from(investmentsTable).where(eq(investmentsTable.userId, id));
  const transactions = await db.select().from(transactionsTable).where(eq(transactionsTable.userId, id)).limit(50);

  const totalDeposited = transactions
    .filter(t => t.type === "deposit" && t.status === "completed")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalWithdrawn = transactions
    .filter(t => t.type === "withdrawal" && t.status === "completed")
    .reduce((s, t) => s + parseFloat(t.amount), 0);

  res.json({
    user: serializeUser(user),
    investments: investments.map(i => serializeInvestment(i)),
    transactions: transactions.map(serializeTxn),
    totalDeposited,
    totalWithdrawn,
  });
});

router.patch("/users/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const { status, role, notes } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (role) updates.role = role;
  if (notes !== undefined) updates.adminNotes = notes;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  await db.insert(activityLogsTable).values({
    userId: req.userId,
    action: "admin_user_update",
    details: `Admin updated user ${id}: status=${status ?? "unchanged"} role=${role ?? "unchanged"}`,
    ipAddress: req.ip || "unknown",
  });

  // Send ban email if admin just banned this account
  if (status === "banned" && user?.email) {
    void (async () => {
      try {
        const banReason = notes ?? "Your account has been suspended by an administrator.";
        const { sendAccountBannedEmail } = await import("../lib/email");
        const result = await sendAccountBannedEmail(
          { email: user.email, name: user.fullName },
          { reason: banReason, siteUrl: process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app" },
        );
        if (!result.ok) logger.error({ error: result.error, email: user.email }, "Ban email failed to deliver");
        else logger.info({ email: user.email }, "Ban email sent");
      } catch (err) {
        logger.error({ err, email: user.email }, "Ban email threw an exception");
      }
    })();
  }

  res.json(serializeUser(user));
});

// ── Balance Adjustment ────────────────────────────────────────────────────────

router.post("/users/:id/balance-adjustment", requireAdmin, async (req: AuthRequest, res: Response) => {
  const userId = parseInt(String(req.params["id"]));
  const { amount, type, note } = req.body as { amount: unknown; type: unknown; note: unknown };

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "Amount must be a positive number" }); return;
  }
  if (type !== "credit" && type !== "debit") {
    res.status(400).json({ error: "Type must be 'credit' or 'debit'" }); return;
  }
  if (!note || String(note).trim().length < 5) {
    res.status(400).json({ error: "A note of at least 5 characters is required" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const adj = Number(amount);
  const currentBalance = parseFloat(String(user.balance ?? "0"));
  const newBalance = type === "credit" ? currentBalance + adj : currentBalance - adj;

  if (newBalance < 0) {
    res.status(400).json({ error: `Insufficient balance. Current balance is KES ${currentBalance.toFixed(2)}` }); return;
  }

  await db.update(usersTable).set({ balance: String(newBalance.toFixed(2)), updatedAt: new Date() }).where(eq(usersTable.id, userId));

  await db.insert(transactionsTable).values({
    userId,
    type: type === "credit" ? "deposit" : "withdrawal",
    amount: String(adj.toFixed(2)),
    status: "completed",
    notes: `[Admin manual ${type}] ${String(note).trim()} — by admin #${req.userId}`,
  });

  await db.insert(activityLogsTable).values({
    userId: req.userId,
    action: `admin_balance_${type}`,
    details: `Admin manually ${type === "credit" ? "credited" : "debited"} KES ${adj.toFixed(2)} ${type === "credit" ? "to" : "from"} user #${userId}. Note: ${String(note).trim()}`,
    ipAddress: req.ip || "unknown",
  });

  logger.info({ adminId: req.userId, userId, type, amount: adj, note }, `Manual balance ${type}`);
  res.json({ ok: true, newBalance });
});

// ── Transactions ─────────────────────────────────────────────────────────────

router.get("/transactions", requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = parseInt(String(req.query["page"] ?? "1"));
  const limit = parseInt(String(req.query["limit"] ?? "20"));
  const offset = (page - 1) * limit;
  const typeRaw = Array.isArray(req.query["type"]) ? req.query["type"][0] : req.query["type"];
  const type = typeRaw ? String(typeRaw) : undefined;
  const statusRaw2 = Array.isArray(req.query["status"]) ? req.query["status"][0] : req.query["status"];
  const status = statusRaw2 ? String(statusRaw2) : undefined;

  let query = db.select().from(transactionsTable).orderBy(sql`${transactionsTable.createdAt} desc`);
  if (type) query = query.where(eq(transactionsTable.type, type as "deposit" | "withdrawal" | "earning")) as typeof query;
  if (status) query = query.where(eq(transactionsTable.status, status as "pending" | "completed" | "failed" | "rejected")) as typeof query;

  // Fix: count with same filters applied
  let countQuery2 = db.select({ count: sql<number>`count(*)` }).from(transactionsTable);
  if (type) countQuery2 = countQuery2.where(eq(transactionsTable.type, type as "deposit" | "withdrawal" | "earning")) as typeof countQuery2;
  if (status) countQuery2 = countQuery2.where(eq(transactionsTable.status, status as "pending" | "completed" | "failed" | "rejected")) as typeof countQuery2;
  const [countResult] = await countQuery2;
  const txns = await query.limit(limit).offset(offset);

  res.json({
    data: txns.map(serializeTxn),
    total: Number(countResult.count),
    page,
    limit,
  });
});

router.post("/transactions/:id/approve", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const [txn] = await db.update(transactionsTable)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(transactionsTable.id, id))
    .returning();
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  await db.insert(activityLogsTable).values({
    userId: req.userId,
    action: "withdrawal_approved",
    details: `Admin approved withdrawal ${id} of KES ${txn.amount}`,
    ipAddress: req.ip || "unknown",
  });

  // Fire-and-forget WhatsApp + email notification to the user
  db.select({ phone: usersTable.phone, fullName: usersTable.fullName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, txn.userId)).limit(1)
    .then(async ([user]) => {
      if (!user) return;
      const amount = parseFloat(String(txn.amount)).toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const method = String(txn.method ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
      // WhatsApp
      try {
        const { sendMessage } = await import("../lib/whatsapp");
        await sendMessage(user.phone,
          `✅ *Withdrawal Approved — Zenti*\n\nHi ${user.fullName},\n\nYour withdrawal request has been *approved* and is being processed.\n\n` +
          `💰 *Amount:* KES ${amount}\n📲 *Method:* ${method}\n🏦 *Account:* ${txn.phoneOrAccount ?? "—"}\n🕐 *Time:* ${time}\n\n` +
          `Funds will arrive shortly. Thank you for using Zenti! 🙏`
        );
      } catch { /* silent */ }
      // Email
      try {
        const [settings] = await db.select().from(platformSettingsTable).limit(1);
        const { sendEmailNotification } = await import("../lib/email");
        await sendEmailNotification({
          email: user.email,
          name: user.fullName,
          subject: `✅ Withdrawal Approved — KES ${amount}`,
          heading: "Your Withdrawal Has Been Approved",
          icon: "✅",
          body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>Great news! Your withdrawal request has been <strong>approved</strong> and is currently being processed.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Amount</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:700;color:#1e293b;text-align:right;">KES ${amount}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Method</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${method}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Account</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${txn.phoneOrAccount ?? "—"}</td></tr>
  <tr><td style="padding:8px 0;color:#64748b;">Time</td><td style="padding:8px 0;text-align:right;">${time}</td></tr>
</table>
<p>Funds will arrive shortly. Thank you for using Zenti! 🙏</p>`,
        }, settings ? {
          host: settings.smtpHost, port: parseInt(settings.smtpPort, 10) || 587,
          user: process.env["SMTP_USER"] ?? "", pass: process.env["SMTP_PASS"] ?? "",
          fromEmail: settings.smtpFromEmail || (process.env["SMTP_USER"] ?? ""),
          fromName: settings.smtpFromName,
        } : undefined);
      } catch { /* silent */ }
    }).catch(() => { /* silent — never block the admin action */ });

  res.json(serializeTxn(txn));
});

router.post("/transactions/:id/reject", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const { reason } = req.body;
  const [original] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id)).limit(1);
  if (!original) { res.status(404).json({ error: "Transaction not found" }); return; }

  const [txn] = await db.update(transactionsTable)
    .set({ status: "rejected", notes: reason, updatedAt: new Date() })
    .where(eq(transactionsTable.id, id))
    .returning();

  // Refund balance
  let refundedUser: { phone: string; fullName: string } | undefined;
  if (original.type === "withdrawal") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, original.userId)).limit(1);
    const newBalance = parseFloat(user.balance ?? "0") + parseFloat(original.amount);
    await db.update(usersTable).set({ balance: String(newBalance) }).where(eq(usersTable.id, original.userId));
    refundedUser = { phone: user.phone, fullName: user.fullName };
  }

  await db.insert(activityLogsTable).values({
    userId: req.userId,
    action: "withdrawal_rejected",
    details: `Admin rejected withdrawal ${id}: ${reason}`,
    ipAddress: req.ip || "unknown",
  });

  // Fire-and-forget WhatsApp + email notification to the user
  if (refundedUser) {
    const { phone, fullName } = refundedUser;
    const userEmail = (await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1))[0]?.email ?? "";
    (async () => {
      const amount = parseFloat(String(original.amount)).toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
      const note = reason ? `\n📝 *Reason:* ${reason}` : "";
      // WhatsApp
      try {
        const { sendMessage } = await import("../lib/whatsapp");
        await sendMessage(phone,
          `❌ *Withdrawal Rejected — Zenti*\n\nHi ${fullName},\n\nYour withdrawal request has been *rejected* and KES ${amount} has been *refunded* to your Zenti wallet.${note}\n\n` +
          `🕐 *Time:* ${time}\n\nIf you have questions, please contact our support team. We apologise for any inconvenience.`
        );
      } catch { /* silent */ }
      // Email
      try {
        const [settings] = await db.select().from(platformSettingsTable).limit(1);
        const { sendEmailNotification } = await import("../lib/email");
        await sendEmailNotification({
          email: userEmail,
          name: fullName,
          subject: `❌ Withdrawal Rejected — KES ${amount} Refunded`,
          heading: "Your Withdrawal Was Rejected",
          icon: "❌",
          body: `<p>Hi <strong>${fullName}</strong>,</p>
<p>Unfortunately, your withdrawal request has been <strong>rejected</strong>. However, <strong>KES ${amount}</strong> has been <strong>refunded</strong> to your Zenti wallet.</p>
${reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;"><strong>Reason:</strong> ${reason}</div>` : ""}
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Amount Refunded</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:700;text-align:right;">KES ${amount}</td></tr>
  <tr><td style="padding:8px 0;color:#64748b;">Time</td><td style="padding:8px 0;text-align:right;">${time}</td></tr>
</table>
<p>If you have any questions, please contact our support team.</p>`,
        }, settings ? {
          host: settings.smtpHost, port: parseInt(settings.smtpPort, 10) || 587,
          user: process.env["SMTP_USER"] ?? "", pass: process.env["SMTP_PASS"] ?? "",
          fromEmail: settings.smtpFromEmail || (process.env["SMTP_USER"] ?? ""),
          fromName: settings.smtpFromName,
        } : undefined);
      } catch { /* silent */ }
    })();
  }

  res.json(serializeTxn(txn));
});

// ── Logs ──────────────────────────────────────────────────────────────────────

router.get("/logs", requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = parseInt(String(req.query["page"] ?? "1"));
  const limit = parseInt(String(req.query["limit"] ?? "50"));
  const userId = req.query["userId"] ? parseInt(String(req.query["userId"])) : undefined;
  const offset = (page - 1) * limit;

  let query = db.select().from(activityLogsTable).orderBy(sql`${activityLogsTable.createdAt} desc`);
  if (userId) query = query.where(eq(activityLogsTable.userId, userId)) as typeof query;
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(activityLogsTable);
  const logs = await query.limit(limit).offset(offset);

  res.json({ data: logs, total: Number(countResult.count), page, limit });
});

// ── Fraud flags ───────────────────────────────────────────────────────────────

// ── Ticket lookup ─────────────────────────────────────────────────────────────

router.get("/ticket/:ticketNumber", requireAdmin, async (req: AuthRequest, res: Response) => {
  const { ticketNumber } = req.params;
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.ticketNumber, ticketNumber))
    .limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  let related: Record<string, unknown> | null = null;
  if (ticket.relatedId) {
    if (ticket.type === "deposit" || ticket.type === "withdrawal") {
      const [txn] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, ticket.relatedId)).limit(1);
      if (txn) related = serializeTxn(txn);
    } else if (ticket.type === "investment") {
      const [inv] = await db.select().from(investmentsTable).where(eq(investmentsTable.id, ticket.relatedId)).limit(1);
      if (inv) related = serializeInvestment(inv);
    }
  }

  let user: Record<string, unknown> | null = null;
  if (ticket.userId) {
    const [u] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, phone: usersTable.phone, status: usersTable.status })
      .from(usersTable).where(eq(usersTable.id, ticket.userId)).limit(1);
    if (u) user = u;
  }

  res.json({ ticket, related, user });
});

router.get("/fraud-flags", requireAdmin, async (_req, res: Response) => {
  const flags = await db
    .select()
    .from(fraudFlagsTable)
    .where(eq(fraudFlagsTable.resolved, false))
    .orderBy(sql`${fraudFlagsTable.createdAt} desc`);

  const txnIds = flags.map(f => f.transactionId);
  const txns = txnIds.length > 0
    ? await db.select().from(transactionsTable).where(sql`${transactionsTable.id} = ANY(ARRAY[${sql.raw(txnIds.join(","))}]::int[])`)
    : [];
  const txnMap = Object.fromEntries(txns.map(t => [t.id, t]));

  res.json(flags.map(f => ({
    id: f.id,
    transactionId: f.transactionId,
    transaction: txnMap[f.transactionId] ? serializeTxn(txnMap[f.transactionId]) : null,
    reason: f.reason,
    severity: f.severity,
    resolved: f.resolved,
    createdAt: f.createdAt,
  })));
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/stats", requireAdmin, async (_req, res: Response) => {
  const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const [activeUsers] = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.status, "active"));
  const [newUsersToday] = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(sql`${usersTable.createdAt}::date = CURRENT_DATE`);
  const [activeInvestments] = await db.select({ count: sql<number>`count(*)` }).from(investmentsTable).where(eq(investmentsTable.status, "active"));
  const [openFraud] = await db.select({ count: sql<number>`count(*)` }).from(fraudFlagsTable).where(eq(fraudFlagsTable.resolved, false));

  const deposits = await db.select({ sum: sql<string>`coalesce(sum(amount::numeric),0)` }).from(transactionsTable)
    .where(sql`type='deposit' AND status='completed'`);
  const withdrawals = await db.select({ sum: sql<string>`coalesce(sum(amount::numeric),0)` }).from(transactionsTable)
    .where(sql`type='withdrawal' AND status='completed'`);
  const earnings = await db.select({ sum: sql<string>`coalesce(sum(amount::numeric),0)` }).from(transactionsTable)
    .where(sql`type='earning' AND status='completed'`);
  const pendingWdSum = await db.select({ sum: sql<string>`coalesce(sum(amount::numeric),0)` }).from(transactionsTable)
    .where(sql`type='withdrawal' AND status='pending'`);
  const [pendingWdCount] = await db.select({ count: sql<number>`count(*)` }).from(transactionsTable)
    .where(sql`type='withdrawal' AND status='pending'`);

  res.json({
    totalUsers: Number(totalUsers.count),
    activeUsers: Number(activeUsers.count),
    newUsersToday: Number(newUsersToday.count),
    totalDeposited: parseFloat(deposits[0].sum),
    totalWithdrawn: parseFloat(withdrawals[0].sum),
    totalEarningsPaid: parseFloat(earnings[0].sum),
    pendingWithdrawals: parseFloat(pendingWdSum[0].sum),
    pendingWithdrawalsCount: Number(pendingWdCount.count),
    fraudFlagsOpen: Number(openFraud.count),
    activeInvestments: Number(activeInvestments.count),
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get("/settings", async (_req, res: Response) => {
  let [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(platformSettingsTable).values({}).returning();
  }
  res.json(settings);
});

router.patch("/settings", requireAdmin, async (req: AuthRequest, res: Response) => {
  const {
    supportEmail, contactPhone, companyName, companyAddress,
    termsOfService, privacyPolicy, aboutUs, maintenanceMode,
    internshipActiveFrom, internshipActiveTo,
    verificationMethod, smtpHost, smtpPort, smtpFromEmail, smtpFromName,
    withdrawalFeePercent, dailyWithdrawalLimitKES, maxActiveInvestments,
    withdrawalCooldownHours, minDepositHoldingHours,
    maintenanceBannerMessage, maintenanceEta,
    payheroAuthToken, payheroChannelId,
  } = req.body;
  let [existing] = await db.select().from(platformSettingsTable).limit(1);
  if (!existing) {
    [existing] = await db.insert(platformSettingsTable).values({}).returning();
  }
  const updates: Record<string, unknown> = {};
  if (supportEmail !== undefined) updates.supportEmail = supportEmail;
  if (contactPhone !== undefined) updates.contactPhone = contactPhone;
  if (companyName !== undefined) updates.companyName = companyName;
  if (companyAddress !== undefined) updates.companyAddress = companyAddress;
  if (termsOfService !== undefined) updates.termsOfService = termsOfService;
  if (privacyPolicy !== undefined) updates.privacyPolicy = privacyPolicy;
  if (aboutUs !== undefined) updates.aboutUs = aboutUs;
  if (maintenanceMode !== undefined) updates.maintenanceMode = maintenanceMode;
  if (internshipActiveFrom !== undefined) updates.internshipActiveFrom = internshipActiveFrom;
  if (internshipActiveTo !== undefined) updates.internshipActiveTo = internshipActiveTo;
  if (verificationMethod !== undefined) updates.verificationMethod = verificationMethod;
  if (smtpHost !== undefined) updates.smtpHost = smtpHost;
  if (smtpPort !== undefined) updates.smtpPort = smtpPort;
  if (smtpFromEmail !== undefined) updates.smtpFromEmail = smtpFromEmail;
  if (smtpFromName !== undefined) updates.smtpFromName = smtpFromName;
  if (withdrawalFeePercent !== undefined) updates.withdrawalFeePercent = String(withdrawalFeePercent);
  if (dailyWithdrawalLimitKES !== undefined) updates.dailyWithdrawalLimitKES = String(dailyWithdrawalLimitKES);
  if (maxActiveInvestments !== undefined) updates.maxActiveInvestments = Number(maxActiveInvestments);
  if (withdrawalCooldownHours !== undefined) updates.withdrawalCooldownHours = Number(withdrawalCooldownHours);
  if (minDepositHoldingHours !== undefined) updates.minDepositHoldingHours = Number(minDepositHoldingHours);
  if (maintenanceBannerMessage !== undefined) updates.maintenanceBannerMessage = maintenanceBannerMessage;
  if (maintenanceEta !== undefined) updates.maintenanceEta = maintenanceEta || null;
  if (payheroAuthToken !== undefined) updates.payheroAuthToken = payheroAuthToken || null;
  if (payheroChannelId !== undefined) updates.payheroChannelId = payheroChannelId || null;
  const [updated] = await db.update(platformSettingsTable).set(updates).where(eq(platformSettingsTable.id, existing.id)).returning();
  // Invalidate the cached maintenance status so the new value takes effect immediately
  const { invalidateMaintenanceCache } = await import("../middlewares/maintenance");
  invalidateMaintenanceCache();
  res.json(updated);
});

// ── Support requests ──────────────────────────────────────────────────────────

router.get("/requests", requireAdmin, async (req: AuthRequest, res: Response) => {
  const statusFilter = req.query["status"] as string | undefined;
  let query = db.select({
    id: supportRequestsTable.id,
    userId: supportRequestsTable.userId,
    name: supportRequestsTable.name,
    email: supportRequestsTable.email,
    phone: supportRequestsTable.phone,
    subject: supportRequestsTable.subject,
    category: supportRequestsTable.category,
    priority: supportRequestsTable.priority,
    message: supportRequestsTable.message,
    status: supportRequestsTable.status,
    adminReply: supportRequestsTable.adminReply,
    createdAt: supportRequestsTable.createdAt,
    updatedAt: supportRequestsTable.updatedAt,
  }).from(supportRequestsTable);

  const rows = await (statusFilter && statusFilter !== "all"
    ? query.where(eq(supportRequestsTable.status, statusFilter as any))
    : query
  ).orderBy(sql`${supportRequestsTable.createdAt} desc`);

  res.json(rows);
});

router.patch("/requests/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const { status, adminReply } = req.body;
  if (!status && adminReply === undefined) {
    res.status(400).json({ error: "status or adminReply required" }); return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (adminReply !== undefined) updates.adminReply = adminReply || null;

  const [updated] = await db.update(supportRequestsTable)
    .set(updates)
    .where(eq(supportRequestsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await db.insert(activityLogsTable).values({
    userId: req.userId,
    action: "admin_ticket_update",
    details: `Admin updated ticket #${id}${status ? ` → ${status}` : ""}${adminReply ? " (with reply)" : ""}`,
    ipAddress: req.ip || "unknown",
  });
  res.json(updated);
});

router.post("/users/:id/reset-password", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const bcrypt = await import("bcryptjs");
  const tempPassword = "TempPass" + Math.floor(100000 + Math.random() * 900000);
  const hash = await bcrypt.hash(tempPassword, 10);

  const [user] = await db.update(usersTable)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  await db.insert(activityLogsTable).values({
    userId: req.userId,
    action: "admin_password_reset",
    details: `Admin reset password for user #${id} (${user.email})`,
    ipAddress: req.ip || "unknown",
  });
  res.json({ tempPassword, email: user.email });
});

// ── WhatsApp Gateway ──────────────────────────────────────────────────────────

router.get("/whatsapp/status", requireAdmin, async (_req: AuthRequest, res: Response) => {
  const { checkGatewayStatus } = await import("../lib/whatsapp");
  const result = await checkGatewayStatus();
  res.json(result);
});

router.post("/whatsapp/test-otp", requireAdmin, async (req: AuthRequest, res: Response) => {
  const { phone, reason } = req.body as { phone?: string; reason?: string };
  if (!phone) { res.status(400).json({ error: "Phone is required" }); return; }
  const { sendOtp } = await import("../lib/whatsapp");
  const result = await sendOtp({
    phone,
    code: String(Math.floor(100000 + Math.random() * 900000)),
    reason: reason ?? "Admin Test",
    ip: req.ip ?? "admin",
  });
  res.json(result);
});

router.post("/whatsapp/test-message", requireAdmin, async (req: AuthRequest, res: Response) => {
  const { phone, text } = req.body as { phone?: string; text?: string };
  if (!phone || !text) { res.status(400).json({ error: "Phone and text are required" }); return; }
  const { sendMessage } = await import("../lib/whatsapp");
  const result = await sendMessage(phone, text);
  res.json(result);
});

// ── Email / SMTP ──────────────────────────────────────────────────────────────

router.post("/email/test-otp", requireAdmin, async (req: AuthRequest, res: Response) => {
  const { email, reason } = req.body as { email?: string; reason?: string };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const { sendEmailOtp } = await import("../lib/email");
  const result = await sendEmailOtp({
    email,
    code: String(Math.floor(100000 + Math.random() * 900000)),
    reason: reason ?? "Admin Test",
  }, settings ? {
    host: settings.smtpHost,
    port: parseInt(settings.smtpPort, 10) || 587,
    user: process.env["SMTP_USER"] ?? "",
    pass: process.env["SMTP_PASS"] ?? "",
    fromEmail: settings.smtpFromEmail || (process.env["SMTP_USER"] ?? ""),
    fromName: settings.smtpFromName,
  } : undefined);
  res.json(result);
});

router.post("/email/test-smtp", requireAdmin, async (_req: AuthRequest, res: Response) => {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const { testSmtpConnection } = await import("../lib/email");
  const result = await testSmtpConnection({
    host: settings?.smtpHost ?? "smtp.gmail.com",
    port: parseInt(settings?.smtpPort ?? "587", 10) || 587,
    user: process.env["SMTP_USER"] ?? "",
    pass: process.env["SMTP_PASS"] ?? "",
  });
  res.json(result);
});

// ── Config Keys (dynamic env overrides stored in DB) ──────────────────────────

router.get("/config-keys", requireAdmin, async (_req: AuthRequest, res: Response) => {
  const [settings] = await db.select({ configKeys: platformSettingsTable.configKeys }).from(platformSettingsTable).limit(1);
  const keys = (settings?.configKeys as Record<string, string>) ?? {};
  // Mask secret-looking values, show which env vars are set at server level
  const result: Record<string, { dbValue: string; envSet: boolean }> = {};
  for (const [k, v] of Object.entries(keys)) {
    result[k] = { dbValue: v, envSet: !!process.env[k] };
  }
  res.json({ keys: result });
});

router.put("/config-keys", requireAdmin, async (req: AuthRequest, res: Response) => {
  const { keys } = req.body as { keys: Record<string, string> };
  if (!keys || typeof keys !== "object") {
    res.status(400).json({ error: "keys must be an object" });
    return;
  }
  // Sanitise — only string values, no nulls
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(keys)) {
    if (k && typeof v === "string") cleaned[k.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")] = v.trim();
  }
  let [existing] = await db.select().from(platformSettingsTable).limit(1);
  if (!existing) [existing] = await db.insert(platformSettingsTable).values({}).returning();
  await db.update(platformSettingsTable).set({ configKeys: cleaned }).where(eq(platformSettingsTable.id, existing.id));
  await db.insert(activityLogsTable).values({
    userId: req.userId,
    action: "config_keys_updated",
    details: `Updated ${Object.keys(cleaned).length} config key(s): ${Object.keys(cleaned).join(", ")}`,
    ipAddress: req.ip || "unknown",
  });
  res.json({ ok: true, count: Object.keys(cleaned).length });
});

export default router;
