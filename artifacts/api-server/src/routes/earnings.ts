import { Router, Response } from "express";
import { db } from "@workspace/db";
import { claimableEarningsTable, usersTable, activityLogsTable, investmentsTable, plansTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";

const router = Router();

/** Returns today's unclaimed earnings that haven't expired */
router.get("/claimable", requireAuth, async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const todayKE = now.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });

  const claimable = await db
    .select()
    .from(claimableEarningsTable)
    .where(
      and(
        eq(claimableEarningsTable.userId, req.userId!),
        eq(claimableEarningsTable.claimed, false),
        eq(claimableEarningsTable.expired, false),
        sql`${claimableEarningsTable.expiresAt} > ${now}`,
        eq(claimableEarningsTable.earningDate, todayKE),
      )
    )
    .orderBy(sql`${claimableEarningsTable.createdAt} desc`);

  const totalClaimable = claimable.reduce((s, e) => s + parseFloat(e.amount), 0);

  // Calculate time until 11:59 PM Kenya time
  const kenyaOffset = 3 * 60 * 60 * 1000;
  const kenyaNow = new Date(now.getTime() + kenyaOffset);
  const midnightKE = new Date(kenyaNow);
  midnightKE.setUTCHours(23, 59, 59, 999);
  const secondsUntilExpiry = Math.max(0, Math.floor((midnightKE.getTime() - kenyaNow.getTime()) / 1000));

  res.json({
    earnings: claimable.map(e => ({
      id: e.id,
      investmentId: e.investmentId,
      amount: parseFloat(e.amount),
      earningDate: e.earningDate,
      expiresAt: e.expiresAt,
      createdAt: e.createdAt,
    })),
    totalClaimable,
    secondsUntilExpiry,
    expiresAt: claimable[0]?.expiresAt ?? null,
  });
});

/** Claim all of today's unclaimed earnings */
router.post("/claim", requireAuth, async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const todayKE = now.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });

  const unclaimed = await db
    .select()
    .from(claimableEarningsTable)
    .where(
      and(
        eq(claimableEarningsTable.userId, req.userId!),
        eq(claimableEarningsTable.claimed, false),
        eq(claimableEarningsTable.expired, false),
        sql`${claimableEarningsTable.expiresAt} > ${now}`,
        eq(claimableEarningsTable.earningDate, todayKE),
      )
    );

  if (unclaimed.length === 0) {
    res.status(400).json({ error: "No claimable earnings available for today. Earnings are generated daily by the cron job." });
    return;
  }

  const totalAmount = unclaimed.reduce((s, e) => s + parseFloat(e.amount), 0);

  // Determine how much of the claimed amount comes from internship investments (must stay locked)
  const investmentIds = [...new Set(unclaimed.map(e => e.investmentId).filter((id): id is number => id != null))];
  let internshipLockedAmount = 0;
  if (investmentIds.length > 0) {
    const investments = await db
      .select({ id: investmentsTable.id, planId: investmentsTable.planId })
      .from(investmentsTable)
      .where(sql`${investmentsTable.id} = ANY(ARRAY[${sql.raw(investmentIds.join(","))}]::int[])`);
    const planIds = [...new Set(investments.map(i => i.planId))];
    if (planIds.length > 0) {
      const plans = await db
        .select({ id: plansTable.id, isInternship: plansTable.isInternship })
        .from(plansTable)
        .where(sql`${plansTable.id} = ANY(ARRAY[${sql.raw(planIds.join(","))}]::int[])`);
      const internshipPlanIds = new Set(plans.filter(p => p.isInternship).map(p => p.id));
      const internshipInvIds = new Set(investments.filter(i => internshipPlanIds.has(i.planId)).map(i => i.id));
      internshipLockedAmount = unclaimed
        .filter(e => e.investmentId != null && internshipInvIds.has(e.investmentId))
        .reduce((s, e) => s + parseFloat(e.amount), 0);
    }
  }

  // Mark all as claimed
  for (const earning of unclaimed) {
    await db
      .update(claimableEarningsTable)
      .set({ claimed: true, claimedAt: now })
      .where(eq(claimableEarningsTable.id, earning.id));
  }

  // Credit user wallet; internship portion also goes to lockedBalance
  await db
    .update(usersTable)
    .set({
      balance: sql`${usersTable.balance} + ${totalAmount}`,
      totalEarned: sql`${usersTable.totalEarned} + ${totalAmount}`,
      lockedBalance: sql`${usersTable.lockedBalance} + ${internshipLockedAmount}`,
      updatedAt: now,
    })
    .where(eq(usersTable.id, req.userId!));

  const [user] = await db
    .select({ email: usersTable.email, fullName: usersTable.fullName, balance: usersTable.balance })
    .from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  await db.insert(activityLogsTable).values({
    userId: req.userId!,
    userEmail: user?.email ?? "unknown",
    action: "earnings_claimed",
    details: `Claimed KES ${totalAmount.toFixed(2)} in daily earnings (${unclaimed.length} earning(s))`,
    ipAddress: req.ip ?? "unknown",
  });

  // Fire-and-forget WhatsApp confirmation
  (async () => {
    try {
      const { sendMessage } = await import("../lib/whatsapp");
      const amtFmt = totalAmount.toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const newBal = (parseFloat(user?.balance ?? "0") + totalAmount).toLocaleString("en-KE", { minimumFractionDigits: 2 });
      await sendMessage(user!.fullName, `✅ *Earnings Claimed — Zenti*\n\nHi ${user!.fullName},\n\nYou have successfully claimed your earnings!\n\n💸 *Claimed:* KES ${amtFmt}\n🏦 *New Balance:* KES ${newBal}\n\nRemember to claim again tomorrow by 11:59 PM! 🚀`);
    } catch { /* silent */ }
  })();

  res.json({
    ok: true,
    claimed: totalAmount,
    claimedCount: unclaimed.length,
    message: `Successfully claimed KES ${totalAmount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`,
  });
});

/** Claim a specific earning by ID */
router.post("/claim/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid earning ID" }); return; }

  const now = new Date();
  const [earning] = await db
    .select()
    .from(claimableEarningsTable)
    .where(
      and(
        eq(claimableEarningsTable.id, id),
        eq(claimableEarningsTable.userId, req.userId!),
        eq(claimableEarningsTable.claimed, false),
        eq(claimableEarningsTable.expired, false),
        sql`${claimableEarningsTable.expiresAt} > ${now}`,
      )
    )
    .limit(1);

  if (!earning) {
    res.status(404).json({ error: "Earning not found, already claimed, or expired" });
    return;
  }

  const amount = parseFloat(earning.amount);

  await db
    .update(claimableEarningsTable)
    .set({ claimed: true, claimedAt: now })
    .where(eq(claimableEarningsTable.id, id));

  await db
    .update(usersTable)
    .set({
      balance: sql`${usersTable.balance} + ${amount}`,
      totalEarned: sql`${usersTable.totalEarned} + ${amount}`,
      updatedAt: now,
    })
    .where(eq(usersTable.id, req.userId!));

  res.json({ ok: true, claimed: amount });
});

/** Get claiming history */
router.get("/history", requireAuth, async (req: AuthRequest, res: Response) => {
  const history = await db
    .select()
    .from(claimableEarningsTable)
    .where(eq(claimableEarningsTable.userId, req.userId!))
    .orderBy(sql`${claimableEarningsTable.createdAt} desc`)
    .limit(30);

  res.json(history.map(e => ({
    id: e.id,
    investmentId: e.investmentId,
    amount: parseFloat(e.amount),
    earningDate: e.earningDate,
    claimed: e.claimed,
    claimedAt: e.claimedAt,
    expired: e.expired,
    expiresAt: e.expiresAt,
    createdAt: e.createdAt,
  })));
});

export default router;
