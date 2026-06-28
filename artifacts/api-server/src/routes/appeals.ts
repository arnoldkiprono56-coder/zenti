import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  banAppealsTable, usersTable, activityLogsTable,
  investmentsTable, referralsTable, claimableEarningsTable,
  transactionsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function requireAdmin(req: AuthRequest, res: Response, next: Function) {
  if (!req.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.userId)).limit(1)
    .then(([u]) => {
      if (!u || (u.role !== "admin" && u.role !== "superadmin")) {
        res.status(403).json({ error: "Forbidden" });
      } else {
        next();
      }
    })
    .catch(() => res.status(500).json({ error: "Internal server error" }));
}

/* ── Full account reset on appeal approval ───────────────────────────────── */
async function resetAccountToCleanSlate(userId: number): Promise<{
  investmentsCancelled: number;
  balanceWiped: string;
}> {
  // 1. Cancel all active investments
  const cancelled = await db
    .update(investmentsTable)
    .set({ status: "cancelled" })
    .where(and(eq(investmentsTable.userId, userId), eq(investmentsTable.status, "active")))
    .returning({ id: investmentsTable.id });

  // 2. Expire all unclaimed earnings
  await db
    .update(claimableEarningsTable)
    .set({ expired: true })
    .where(and(eq(claimableEarningsTable.userId, userId), eq(claimableEarningsTable.claimed, false)));

  // 3. Read current balance for log
  const [before] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  // 4. Reset user to clean-slate financial and referral state
  await db.update(usersTable).set({
    balance: "0",
    lockedBalance: "0",
    totalEarned: "0",
    referralStatus: "none",
    referralCountdownDeadline: null,
    internshipActivated: false,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId));

  logger.info(
    { userId, investmentsCancelled: cancelled.length, balanceWiped: before?.balance },
    "Account reset to clean slate after appeal approval",
  );

  return {
    investmentsCancelled: cancelled.length,
    balanceWiped: String(before?.balance ?? "0"),
  };
}

/* ── Submit an appeal (banned users only — no requireAuth since they can't log in) ── */
router.post("/submit", async (req: Request, res: Response) => {
  const { email, message } = req.body as { email?: string; message?: string };
  if (!email || !message?.trim()) {
    res.status(400).json({ error: "Email and message are required" });
    return;
  }
  if (message.trim().length < 30) {
    res.status(400).json({ error: "Please provide more detail in your appeal (at least 30 characters)" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(404).json({ error: "No account found with that email address" });
    return;
  }
  if (user.status !== "banned") {
    res.status(400).json({ error: "This account is not currently banned" });
    return;
  }

  const [existing] = await db
    .select({ id: banAppealsTable.id, status: banAppealsTable.status })
    .from(banAppealsTable)
    .where(and(eq(banAppealsTable.userId, user.id), eq(banAppealsTable.status, "pending")))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "You already have a pending appeal. Please wait for it to be reviewed." });
    return;
  }

  await db.insert(banAppealsTable).values({ userId: user.id, message: message.trim() });

  await db.insert(activityLogsTable).values({
    userId: user.id,
    userEmail: user.email,
    action: "ban_appeal_submitted",
    details: `Ban appeal submitted by ${user.fullName}`,
    ipAddress: req.ip ?? "unknown",
  });

  res.status(201).json({ message: "Your appeal has been submitted. Our team will review it within 48 hours." });
});

/* ── Admin: list all appeals ─────────────────────────────────────── */
router.get("/", requireAuth, requireAdmin as any, async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const conditions = status ? [eq(banAppealsTable.status, status as any)] : [];

  const appeals = await db
    .select({
      id: banAppealsTable.id,
      userId: banAppealsTable.userId,
      message: banAppealsTable.message,
      status: banAppealsTable.status,
      adminNote: banAppealsTable.adminNote,
      createdAt: banAppealsTable.createdAt,
      resolvedAt: banAppealsTable.resolvedAt,
      userName: usersTable.fullName,
      userEmail: usersTable.email,
      bannedReason: usersTable.bannedReason,
      bannedAt: usersTable.bannedAt,
    })
    .from(banAppealsTable)
    .innerJoin(usersTable, eq(banAppealsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(banAppealsTable.createdAt));

  res.json(appeals);
});

/* ── Admin: resolve an appeal ────────────────────────────────────── */
router.post("/:id/resolve", requireAuth, requireAdmin as any, async (req: AuthRequest, res: Response) => {
  const appealId = parseInt(String(req.params.id));
  const { action, adminNote } = req.body as { action: "approve" | "reject"; adminNote?: string };

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }

  const [appeal] = await db.select().from(banAppealsTable).where(eq(banAppealsTable.id, appealId)).limit(1);
  if (!appeal) { res.status(404).json({ error: "Appeal not found" }); return; }

  const now = new Date();

  await db.update(banAppealsTable).set({
    status: action === "approve" ? "approved" : "rejected",
    adminNote: adminNote?.trim() ?? null,
    resolvedById: req.userId,
    resolvedAt: now,
  }).where(eq(banAppealsTable.id, appealId));

  if (action === "approve") {
    // Step 1: Reinstate the account
    await db.update(usersTable).set({
      status: "active",
      bannedReason: null,
      bannedAt: null,
      updatedAt: now,
    }).where(eq(usersTable.id, appeal.userId));

    // Step 2: Full clean-slate reset (investments, balance, referrals)
    const resetSummary = await resetAccountToCleanSlate(appeal.userId);

    // Step 3: Log the reset
    await db.insert(activityLogsTable).values({
      userId: appeal.userId,
      userEmail: "system-appeal",
      action: "account_reset_on_appeal",
      details: `Appeal #${appealId} approved — account fully reset: ${resetSummary.investmentsCancelled} investment(s) cancelled, KES ${resetSummary.balanceWiped} balance wiped, referral status reset to none, internship reset.`,
      ipAddress: "system",
    });

    // Step 4: Email user
    const [user] = await db.select({ email: usersTable.email, fullName: usersTable.fullName })
      .from(usersTable).where(eq(usersTable.id, appeal.userId)).limit(1);

    if (user) {
      void (async () => {
        try {
          const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
          const result = await sendEmailNotification({
            email: user.email,
            name: user.fullName,
            subject: "Your Zenti Appeal Has Been Approved ✅",
            heading: "Appeal Approved — Account Reinstated",
            icon: "✅",
            body: `<p>Great news, <strong>${user.fullName}</strong> — your appeal has been approved and your account has been reinstated.</p>
<p>As per our Terms of Service, your account has been <strong>fully reset to a clean starting state</strong>:</p>
<ul style="margin: 12px 0; padding-left: 20px; color: #374151;">
  <li>All active investment plans have been cancelled</li>
  <li>Your wallet balance has been reset to KES 0</li>
  <li>Your referral progress and tier have been reset</li>
  <li>Your Internship Package eligibility has been restored</li>
</ul>
<p>You can now log in and start fresh. If you believe a balance reset was applied in error, please <a href="${process.env.APP_URL || process.env.FRONTEND_URL || ""}/support">contact our support team</a>.</p>
${adminNote ? `<p style="margin-top:12px"><strong>Admin note:</strong> ${adminNote}</p>` : ""}`,
          }, getDefaultSmtpConfig());
          if (!result.ok) logger.error({ error: result.error, email: user.email }, "Appeal approval email failed");
          else logger.info({ email: user.email }, "Appeal approval email sent");
        } catch (err) {
          logger.error({ err, email: user.email }, "Appeal approval email threw an exception");
        }
      })();
    }
  } else {
    const [user] = await db.select({ email: usersTable.email, fullName: usersTable.fullName })
      .from(usersTable).where(eq(usersTable.id, appeal.userId)).limit(1);

    if (user) {
      void (async () => {
        try {
          const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
          const result = await sendEmailNotification({
            email: user.email,
            name: user.fullName,
            subject: "Your Zenti Appeal Has Been Reviewed",
            heading: "Appeal Decision",
            icon: "ℹ️",
            body: `<p>Hi <strong>${user.fullName}</strong>,</p>
<p>After careful review, we were unable to reinstate your account at this time.</p>
${adminNote ? `<p><strong>Reason:</strong> ${adminNote}</p>` : ""}
<p>If you believe this decision is in error, please <a href="${process.env.APP_URL || process.env.FRONTEND_URL || ""}/support">open a support ticket</a> with additional evidence.</p>`,
          }, getDefaultSmtpConfig());
          if (!result.ok) logger.error({ error: result.error, email: user.email }, "Appeal rejection email failed");
          else logger.info({ email: user.email }, "Appeal rejection email sent");
        } catch (err) {
          logger.error({ err, email: user.email }, "Appeal rejection email threw an exception");
        }
      })();
    }
  }

  await db.insert(activityLogsTable).values({
    userId: req.userId!,
    userEmail: "admin",
    action: action === "approve" ? "ban_appeal_approved" : "ban_appeal_rejected",
    details: `Appeal #${appealId} for user #${appeal.userId} ${action}d by admin #${req.userId}`,
    ipAddress: req.ip ?? "unknown",
  });

  res.json({ message: `Appeal ${action}d successfully` });
});

export default router;
