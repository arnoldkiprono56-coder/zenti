import { Router, Response } from "express";
import { db } from "@workspace/db";
import { usersTable, referralsTable, referralPayoutsTable, transactionsTable, investmentsTable, activityLogsTable, plansTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const SITE_URL = process.env.FRONTEND_URL || process.env.APP_URL || "https://zenti-investment-kenya.vercel.app";

const router = Router();

export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function updateReferrerTier(referrerId: number) {
  const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referrerId)).limit(1);
  if (!referrer) return;

  const activeReferrals = await db
    .select({ refereeId: referralsTable.refereeId })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.isActive, true)));

  const activeCount = activeReferrals.length;
  const now = new Date();

  if (referrer.referralStatus === "none" && activeCount >= 1) {
    const deadline = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    await db.update(usersTable).set({
      referralStatus: "countdown",
      referralCountdownDeadline: deadline,
      updatedAt: now,
    }).where(eq(usersTable.id, referrerId));

    // Send enrollment confirmation email
    void (async () => {
      try {
        const { sendReferralEnrollmentEmail, getDefaultSmtpConfig } = await import("../lib/email");
        const referralLink = `${SITE_URL}/register?ref=${referrer.referralCode}`;
        const result = await sendReferralEnrollmentEmail(
          { email: referrer.email, name: referrer.fullName },
          { referralLink, referralCode: referrer.referralCode ?? "", deadlineDate: deadline },
          getDefaultSmtpConfig(),
        );
        if (!result.ok) logger.error({ error: result.error, email: referrer.email }, "Referral enrollment email failed");
        else logger.info({ email: referrer.email }, "Referral enrollment email sent");
      } catch (err) {
        logger.error({ err }, "Referral enrollment email threw an exception");
      }
    })();
    return;
  }

  if (referrer.referralStatus === "countdown") {
    const deadline = referrer.referralCountdownDeadline;
    const expired = deadline && now > deadline;
    const countdownStarted = deadline ? new Date(deadline.getTime() - 10 * 24 * 60 * 60 * 1000) : now;
    const withinFirstWeek = (now.getTime() - countdownStarted.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    const isLegend = withinFirstWeek && activeCount > 10;

    if (!expired && (activeCount >= 5 || isLegend)) {
      await db.update(usersTable).set({ referralStatus: "elite", updatedAt: now }).where(eq(usersTable.id, referrerId));
      return;
    }
    if (expired && activeCount < 5) {
      await db.update(usersTable).set({ referralStatus: "standard", updatedAt: now }).where(eq(usersTable.id, referrerId));
      return;
    }
    if (expired && activeCount >= 5) {
      await db.update(usersTable).set({ referralStatus: "elite", updatedAt: now }).where(eq(usersTable.id, referrerId));
      return;
    }
  }

  if (referrer.referralStatus === "elite" && activeCount < 5) {
    await db.update(usersTable).set({ referralStatus: "standard", updatedAt: now }).where(eq(usersTable.id, referrerId));
  }
}

/* ── GET /me ─────────────────────────────────────────────────────────────── */
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, req.userId!));
  const activeCount = referrals.filter(r => r.isActive).length;
  const totalCount = referrals.length;

  const payouts = await db
    .select()
    .from(referralPayoutsTable)
    .where(eq(referralPayoutsTable.referrerId, req.userId!))
    .orderBy(sql`${referralPayoutsTable.payoutDate} desc`)
    .limit(10);

  const totalEarned = payouts.reduce((sum, p) => sum + parseFloat(p.bonusAmount), 0);

  let countdownDaysLeft: number | null = null;
  if (user.referralStatus === "countdown" && user.referralCountdownDeadline) {
    const msLeft = new Date(user.referralCountdownDeadline).getTime() - Date.now();
    countdownDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  }

  // Determine if user qualifies for Legend bonus (>10 active in first 7 days)
  let isLegend = false;
  if ((user.referralStatus === "elite" || user.referralStatus === "countdown") && user.referralCountdownDeadline) {
    const countdownStarted = new Date(user.referralCountdownDeadline.getTime() - 10 * 24 * 60 * 60 * 1000);
    const msElapsed = Date.now() - countdownStarted.getTime();
    isLegend = msElapsed <= 7 * 24 * 60 * 60 * 1000 && activeCount > 10;
  }

  const referralLink = `${SITE_URL}/register?ref=${user.referralCode}`;

  res.json({
    referralCode: user.referralCode,
    referralLink,
    tier: user.referralStatus,
    countdownDaysLeft,
    countdownDeadline: user.referralCountdownDeadline,
    activeReferrals: activeCount,
    totalReferrals: totalCount,
    totalEarned,
    isLegend,
    recentPayouts: payouts.map(p => ({
      id: p.id,
      bonusAmount: parseFloat(p.bonusAmount),
      bonusPercent: parseFloat(p.bonusPercent),
      isElite: p.isElite,
      payoutDate: p.payoutDate,
    })),
  });
});

/* ── GET /my-referrals ───────────────────────────────────────────────────── */
router.get("/my-referrals", requireAuth, async (req: AuthRequest, res: Response) => {
  const referrals = await db
    .select({
      id: referralsTable.id,
      refereeId: referralsTable.refereeId,
      isActive: referralsTable.isActive,
      depositBonusPaid: referralsTable.depositBonusPaid,
      createdAt: referralsTable.createdAt,
      refereeName: usersTable.fullName,
      refereeEmail: usersTable.email,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.refereeId, usersTable.id))
    .where(eq(referralsTable.referrerId, req.userId!))
    .orderBy(sql`${referralsTable.createdAt} desc`);

  // Enrich each referral with plan info and earnings
  const enriched = await Promise.all(referrals.map(async (r) => {
    const [inv] = await db
      .select({ amountInvested: investmentsTable.amountInvested, planName: plansTable.name })
      .from(investmentsTable)
      .innerJoin(plansTable, eq(investmentsTable.planId, plansTable.id))
      .where(and(eq(investmentsTable.userId, r.refereeId), eq(investmentsTable.status, "active")))
      .orderBy(sql`${investmentsTable.createdAt} desc`)
      .limit(1);

    const [firstDeposit] = await db
      .select({ amount: transactionsTable.amount })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.userId, r.refereeId),
        eq(transactionsTable.type, "deposit"),
        eq(transactionsTable.status, "completed"),
      ))
      .orderBy(sql`${transactionsTable.createdAt} asc`)
      .limit(1);

    const depositAmount = parseFloat(firstDeposit?.amount ?? "0");
    const bonusEarned = r.depositBonusPaid && depositAmount > 0 ? depositAmount * 0.1 : 0;
    const bonusExpected = !r.depositBonusPaid && r.isActive && depositAmount > 0 ? depositAmount * 0.1 : 0;

    return {
      ...r,
      planName: inv?.planName ?? null,
      amountInvested: inv ? parseFloat(inv.amountInvested) : null,
      bonusEarned,
      bonusExpected,
    };
  }));

  res.json(enriched);
});

/* ── POST /apply — enroll and send confirmation email ────────────────────── */
router.post("/apply", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Ensure user has a referral code
  if (!user.referralCode) {
    const code = generateReferralCode();
    await db.update(usersTable).set({ referralCode: code, updatedAt: new Date() }).where(eq(usersTable.id, req.userId!));
    user.referralCode = code;
  }

  const referralLink = `${SITE_URL}/register?ref=${user.referralCode}`;

  // Send welcome-to-referral-program email
  void (async () => {
    try {
      const { sendReferralWelcomeEmail, getDefaultSmtpConfig } = await import("../lib/email");
      const result = await sendReferralWelcomeEmail(
        { email: user.email, name: user.fullName },
        { referralLink, referralCode: user.referralCode ?? "" },
        getDefaultSmtpConfig(),
      );
      if (!result.ok) logger.error({ error: result.error, email: user.email }, "Referral welcome email failed");
      else logger.info({ email: user.email }, "Referral welcome email sent");
    } catch (err) {
      logger.error({ err, email: user.email }, "Referral welcome email threw an exception");
    }
  })();

  await db.insert(activityLogsTable).values({
    userId: req.userId!,
    userEmail: user.email,
    action: "referral_program_applied",
    details: "User applied to referral program and received confirmation email",
    ipAddress: req.ip || "unknown",
  });

  res.json({
    ok: true,
    referralCode: user.referralCode,
    referralLink,
    message: "You are enrolled in the referral program. Check your email for full details.",
  });
});

/* ── Sunday bonus processing ─────────────────────────────────────────────── */
export async function processSundayBonuses() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const eliteAndStandard = await db
    .select()
    .from(usersTable)
    .where(sql`${usersTable.referralStatus} IN ('elite', 'standard')`);

  for (const referrer of eliteAndStandard) {
    const activeReferrals = await db
      .select({ refereeId: referralsTable.refereeId })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, referrer.id), eq(referralsTable.isActive, true)));

    if (activeReferrals.length === 0) continue;

    const isCurrentlyElite = referrer.referralStatus === "elite" && activeReferrals.length >= 5;

    // Check for Legend bonus: >10 active in first 7 days
    let isLegend = false;
    if (isCurrentlyElite && referrer.referralCountdownDeadline) {
      const countdownStarted = new Date(referrer.referralCountdownDeadline.getTime() - 10 * 24 * 60 * 60 * 1000);
      const msElapsed = now.getTime() - countdownStarted.getTime();
      isLegend = msElapsed <= 7 * 24 * 60 * 60 * 1000 && activeReferrals.length > 10;
    }

    const refereeIds = activeReferrals.map(r => r.refereeId);
    const sundayEarnings = await db
      .select({ sum: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(
        and(
          inArray(transactionsTable.userId, refereeIds),
          eq(transactionsTable.type, "earning"),
          eq(transactionsTable.status, "completed"),
          sql`${transactionsTable.createdAt} >= ${todayStart}`,
          sql`${transactionsTable.createdAt} <= ${todayEnd}`,
        )
      );

    const totalEarnings = parseFloat(sundayEarnings[0]?.sum ?? "0");
    if (totalEarnings <= 0) continue;

    let bonusPercent: number;
    if (isLegend) {
      // Legend: 30% + extra 5-10%
      bonusPercent = 30 + Math.floor(Math.random() * 6) + 5;
    } else if (isCurrentlyElite) {
      bonusPercent = 30;
    } else {
      bonusPercent = Math.floor(Math.random() * 6) + 5;
    }

    const bonusAmount = (totalEarnings * bonusPercent) / 100;

    await db.update(usersTable)
      .set({ balance: sql`balance::numeric + ${bonusAmount}` })
      .where(eq(usersTable.id, referrer.id));

    await db.insert(referralPayoutsTable).values({
      referrerId: referrer.id,
      refereeEarningsTotal: String(totalEarnings),
      bonusPercent: String(bonusPercent),
      bonusAmount: String(bonusAmount),
      isElite: isCurrentlyElite,
      payoutDate: now,
    });

    const tierLabel = isLegend ? "Legend" : isCurrentlyElite ? "Elite" : "Standard";
    await db.insert(activityLogsTable).values({
      userId: referrer.id,
      userEmail: referrer.email,
      action: "referral_bonus_paid",
      details: `Sunday referral bonus: ${bonusPercent}% of KES ${totalEarnings} = KES ${bonusAmount.toFixed(2)} (${tierLabel})`,
      ipAddress: "system",
    });

    // Email notification for the bonus
    void (async () => {
      try {
        const { sendEmailNotification, getDefaultSmtpConfig } = await import("../lib/email");
        await sendEmailNotification({
          email: referrer.email,
          name: referrer.fullName,
          subject: `🎁 Sunday Referral Bonus: KES ${bonusAmount.toFixed(2)} credited!`,
          heading: "Your Sunday Bonus Is Here!",
          body: `<p>Hi <strong>${referrer.fullName}</strong>,</p>
<p>Your weekly referral bonus has been automatically credited to your Zenti balance.</p>
<p><strong>Bonus Amount:</strong> KES ${bonusAmount.toFixed(2)}<br/><strong>Bonus Rate:</strong> ${bonusPercent}%<br/><strong>Tier:</strong> ${tierLabel}</p>
<p>This amount is now available in your Zenti wallet. No action needed — it was added automatically.</p>`,
          icon: "🎁",
        }, getDefaultSmtpConfig());
      } catch { /* silent */ }
    })();
  }
}

/* ── POST /trigger-sunday-bonus (admin only) ────────────────────────────── */
router.post("/trigger-sunday-bonus", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await processSundayBonuses();
  res.json({ message: "Sunday bonuses processed" });
});

/* ── GET /admin/overview ─────────────────────────────────────────────────── */
router.get("/admin/overview", requireAuth, async (req: AuthRequest, res: Response) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!caller || (caller.role !== "admin" && caller.role !== "superadmin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [eliteCount, standardCount, countdownCount, totalReferrers] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.referralStatus as any, "elite")),
    db.select({ c: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.referralStatus as any, "standard")),
    db.select({ c: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.referralStatus as any, "countdown")),
    db.select({ c: sql<number>`count(distinct referrer_id)::int` }).from(referralsTable),
  ]);

  const totalBonusPaid = await db
    .select({ total: sql<string>`coalesce(sum(bonus_amount::numeric), 0)` })
    .from(referralPayoutsTable);

  const totalDepositBonuses = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(referralsTable)
    .where(eq(referralsTable.depositBonusPaid, true));

  const leaderboard = await db
    .select({
      referrerId: referralPayoutsTable.referrerId,
      name: usersTable.fullName,
      email: usersTable.email,
      tier: usersTable.referralStatus,
      totalEarned: sql<string>`coalesce(sum(bonus_amount::numeric), 0)`,
      payoutCount: sql<number>`count(*)::int`,
    })
    .from(referralPayoutsTable)
    .innerJoin(usersTable, eq(referralPayoutsTable.referrerId, usersTable.id))
    .groupBy(referralPayoutsTable.referrerId, usersTable.fullName, usersTable.email, usersTable.referralStatus)
    .orderBy(sql`sum(bonus_amount::numeric) desc`)
    .limit(15);

  const recentPayouts = await db
    .select({
      id: referralPayoutsTable.id,
      referrerId: referralPayoutsTable.referrerId,
      referrerName: usersTable.fullName,
      bonusAmount: referralPayoutsTable.bonusAmount,
      bonusPercent: referralPayoutsTable.bonusPercent,
      isElite: referralPayoutsTable.isElite,
      payoutDate: referralPayoutsTable.payoutDate,
    })
    .from(referralPayoutsTable)
    .innerJoin(usersTable, eq(referralPayoutsTable.referrerId, usersTable.id))
    .orderBy(sql`${referralPayoutsTable.payoutDate} desc`)
    .limit(20);

  const activeReferralCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(referralsTable)
    .where(eq(referralsTable.isActive, true));

  res.json({
    tiers: {
      elite: eliteCount[0]?.c ?? 0,
      standard: standardCount[0]?.c ?? 0,
      countdown: countdownCount[0]?.c ?? 0,
    },
    totalReferrers: totalReferrers[0]?.c ?? 0,
    totalBonusPaid: parseFloat(totalBonusPaid[0]?.total ?? "0"),
    depositBonusesPaid: totalDepositBonuses[0]?.c ?? 0,
    activeReferralLinks: activeReferralCount[0]?.c ?? 0,
    leaderboard: leaderboard.map(r => ({
      referrerId: r.referrerId,
      name: r.name,
      email: r.email,
      tier: r.tier,
      totalEarned: parseFloat(r.totalEarned),
      payoutCount: r.payoutCount,
    })),
    recentPayouts: recentPayouts.map(p => ({
      id: p.id,
      referrerId: p.referrerId,
      referrerName: p.referrerName,
      bonusAmount: parseFloat(p.bonusAmount),
      bonusPercent: parseFloat(p.bonusPercent),
      isElite: p.isElite,
      payoutDate: p.payoutDate,
    })),
  });
});

export default router;
