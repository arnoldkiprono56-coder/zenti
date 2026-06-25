import { Router, Response } from "express";
import { db } from "@workspace/db";
import { investmentsTable, plansTable, usersTable, transactionsTable, activityLogsTable, referralsTable, ticketsTable } from "@workspace/db";
import { createTicket } from "../lib/tickets";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { serializePlan } from "./plans";
import { updateReferrerTier } from "./referrals";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const investments = await db
    .select()
    .from(investmentsTable)
    .where(eq(investmentsTable.userId, req.userId!))
    .orderBy(sql`${investmentsTable.startedAt} desc`);
  const planIds = [...new Set(investments.map(i => i.planId))];
  const plans = planIds.length > 0
    ? await db.select().from(plansTable).where(sql`${plansTable.id} = ANY(${sql.raw(`ARRAY[${planIds.join(",")}]`)})`)
    : [];
  const planMap = Object.fromEntries(plans.map(p => [p.id, p]));
  res.json(investments.map(i => serializeInvestment(i, planMap[i.planId])));
});

router.post("/internship", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user.isInternshipEligible) {
    res.status(400).json({ error: "Not eligible for the internship package" });
    return;
  }
  if (user.internshipActivated) {
    res.status(400).json({ error: "Internship package already activated" });
    return;
  }
  const userBalance = parseFloat(user.balance ?? "0");
  const userLockedBalance = parseFloat(user.lockedBalance ?? "0");
  if (userBalance < 100 || userLockedBalance < 100) {
    res.status(400).json({ error: "Insufficient starter credit to activate internship" });
    return;
  }
  let [internshipPlan] = await db.select().from(plansTable).where(eq(plansTable.isInternship, true)).limit(1);
  if (!internshipPlan) {
    // Auto-seed the internship plan if an admin hasn't created one yet
    const [created] = await db.insert(plansTable).values({
      name: "2-Day Internship Package",
      description: "Free starter package — earn KES 200 over 2 days, no deposit needed",
      minDeposit: "0",
      dailyReturnPercent: "0",
      durationDays: 2,
      isActive: true,
      isInternship: true,
      internshipFixedEarning: "200",
    }).returning();
    internshipPlan = created;
  }
  const startedAt = new Date();
  const completesAt = new Date(startedAt.getTime() + 2 * 24 * 60 * 60 * 1000);
  const fixedEarning = parseFloat(internshipPlan.internshipFixedEarning ?? "200");
  const dailyEarning = fixedEarning / 2;
  const [investment] = await db.insert(investmentsTable).values({
    userId: req.userId!,
    planId: internshipPlan.id,
    amountInvested: "0",
    dailyEarning: String(dailyEarning),
    totalEarned: "0",
    expectedTotal: String(fixedEarning),
    startedAt,
    completesAt,
  }).returning();
  await db.update(usersTable).set({
    internshipActivated: true,
    balance: sql`${usersTable.balance} - 100`,
    lockedBalance: sql`${usersTable.lockedBalance} - 100`,
  }).where(eq(usersTable.id, req.userId!));
  await db.insert(activityLogsTable).values({
    userId: req.userId!,
    userEmail: user.email,
    action: "internship_activated",
    details: `User activated internship package`,
    ipAddress: req.ip || "unknown",
  });
  // Create investment ticket
  const internshipTicket = await createTicket({
    type: "investment",
    userId: req.userId!,
    relatedId: investment.id,
    metadata: { planName: "2-Day Internship Package", isInternship: true },
  });

  res.status(201).json({ ...serializeInvestment(investment, internshipPlan), ticketNumber: internshipTicket.ticketNumber });

  // Fire-and-forget WhatsApp notification with claiming warning
  (async () => {
    try {
      const { sendMessage } = await import("../lib/whatsapp");
      const matures = completesAt.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "long", year: "numeric" });
      await sendMessage(user.phone,
        `🎓 *Internship Package Activated — Zenti*\n\nHi ${user.fullName},\n\nYour 2-day Internship Package is now active!\n\n` +
        `💵 *Fixed Earning:* KES ${fixedEarning.toLocaleString("en-KE", { minimumFractionDigits: 2 })}\n` +
        `📅 *Daily Earning:* KES ${dailyEarning.toLocaleString("en-KE", { minimumFractionDigits: 2 })}\n` +
        `🗓 *Completes:* ${matures}\n` +
        `🎫 *Ticket:* ${internshipTicket.ticketNumber}\n\n` +
        `⚠️ *IMPORTANT — Daily Claiming Required:*\n` +
        `You MUST log in and claim your daily earnings every day by *11:59 PM*. Unclaimed earnings are permanently lost at midnight!\n\n` +
        `💰 *Withdrawal Rule:* You can only withdraw your earnings on the LAST DAY of your active investment.\n\n` +
        `Good luck! 🚀`
      );
    } catch { /* silent */ }
  })();

  // Fire-and-forget activation email with full warning template
  (async () => {
    try {
      const { sendPackageActivatedEmail } = await import("../lib/email");
      await sendPackageActivatedEmail(
        { email: user.email, name: user.fullName },
        {
          planName: "2-Day Internship Package",
          isInternship: true,
          amountInvested: 0,
          dailyEarning,
          expectedTotal: fixedEarning,
          completesAt,
          durationDays: 2,
          ticketNumber: internshipTicket.ticketNumber,
        },
      );
    } catch { /* silent */ }
  })();
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const { planId, amount } = req.body;
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1);
  if (!plan || !plan.isActive) {
    res.status(400).json({ error: "Plan not found or inactive" });
    return;
  }
  if (plan.isInternship) {
    res.status(400).json({ error: "Use the internship endpoint" });
    return;
  }

  // Fix: only validate against minDeposit — plans table has no maxDeposit column
  const minDep = parseFloat(plan.minDeposit);
  if (amount < minDep) {
    res.status(400).json({ error: `Minimum investment for this plan is KES ${minDep.toLocaleString("en-KE", { minimumFractionDigits: 2 })}` });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  const balance = parseFloat(user.balance ?? "0");
  if (balance < amount) {
    res.status(400).json({ error: "Insufficient balance. Please deposit first." });
    return;
  }
  const dailyReturn = parseFloat(plan.dailyReturnPercent) / 100;
  const dailyEarning = amount * dailyReturn;
  const expectedTotal = dailyEarning * plan.durationDays;
  const startedAt = new Date();
  const completesAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ balance: String(balance - amount) })
    .where(eq(usersTable.id, req.userId!));

  const [investment] = await db.insert(investmentsTable).values({
    userId: req.userId!,
    planId: plan.id,
    amountInvested: String(amount),
    dailyEarning: String(dailyEarning),
    totalEarned: "0",
    expectedTotal: String(expectedTotal),
    startedAt,
    completesAt,
  }).returning();

  await db.insert(activityLogsTable).values({
    userId: req.userId!,
    userEmail: user.email,
    action: "investment_started",
    details: `Invested KES ${amount} in plan: ${plan.name}`,
    ipAddress: req.ip || "unknown",
  });

  // Mark referral as active and update referrer tier
  const referral = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.refereeId, req.userId!))
    .limit(1);
  if (referral.length > 0 && !referral[0].isActive) {
    await db.update(referralsTable)
      .set({ isActive: true })
      .where(eq(referralsTable.refereeId, req.userId!));
    await updateReferrerTier(referral[0].referrerId);
  }

  // Create investment ticket
  const premiumTicket = await createTicket({
    type: "investment",
    userId: req.userId!,
    relatedId: investment.id,
    metadata: { planName: plan.name, amountInvested: amount },
  });

  res.status(201).json({ ...serializeInvestment(investment, plan), ticketNumber: premiumTicket.ticketNumber });

  // Fire-and-forget WhatsApp notification with claiming warning
  (async () => {
    try {
      const { sendMessage } = await import("../lib/whatsapp");
      const amtFmt = Number(amount).toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const dailyFmt = dailyEarning.toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const totalFmt = expectedTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const matures = completesAt.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "long", year: "numeric" });
      await sendMessage(user.phone,
        `📈 *Investment Started — Zenti*\n\nHi ${user.fullName},\n\nYour investment is now active!\n\n` +
        `💰 *Plan:* ${plan.name}\n` +
        `💵 *Invested:* KES ${amtFmt}\n` +
        `📅 *Daily Earning:* KES ${dailyFmt}\n` +
        `🎯 *Expected Total:* KES ${totalFmt}\n` +
        `🗓 *Matures:* ${matures}\n` +
        `🎫 *Ticket:* ${premiumTicket.ticketNumber}\n\n` +
        `⚠️ *IMPORTANT — Daily Claiming Required:*\n` +
        `You MUST log in and claim your daily earnings every day by *11:59 PM*. Unclaimed earnings are permanently lost at midnight!\n\n` +
        `💰 *Withdrawal Rule:* Withdrawals are ONLY available on the LAST DAY (${matures}) of your investment.\n\n` +
        `Keep investing and watch your money grow! 💹`
      );
    } catch { /* silent */ }
  })();

  // Fire-and-forget full warning email template
  (async () => {
    try {
      const { sendPackageActivatedEmail } = await import("../lib/email");
      await sendPackageActivatedEmail(
        { email: user.email, name: user.fullName },
        {
          planName: plan.name,
          isInternship: false,
          amountInvested: amount,
          dailyEarning,
          expectedTotal,
          completesAt,
          durationDays: plan.durationDays,
          ticketNumber: premiumTicket.ticketNumber,
        },
      );
    } catch { /* silent */ }
  })();
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const [inv] = await db.select().from(investmentsTable)
    .where(and(eq(investmentsTable.id, id), eq(investmentsTable.userId, req.userId!)))
    .limit(1);
  if (!inv) { res.status(404).json({ error: "Investment not found" }); return; }
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, inv.planId)).limit(1);
  res.json(serializeInvestment(inv, plan));
});

export function serializeInvestment(inv: typeof investmentsTable.$inferSelect, plan?: typeof plansTable.$inferSelect) {
  const totalEarned = parseFloat(inv.totalEarned ?? "0");
  const expectedTotal = parseFloat(inv.expectedTotal ?? "0");
  const progressPercent = expectedTotal > 0 ? Math.min(100, (totalEarned / expectedTotal) * 100) : 0;
  return {
    id: inv.id,
    userId: inv.userId,
    planId: inv.planId,
    plan: plan ? serializePlan(plan) : undefined,
    amountInvested: parseFloat(inv.amountInvested ?? "0"),
    dailyEarning: parseFloat(inv.dailyEarning ?? "0"),
    totalEarned,
    expectedTotal,
    progressPercent,
    status: inv.status,
    startedAt: inv.startedAt,
    completesAt: inv.completesAt,
    lastEarningAt: inv.lastEarningAt,
  };
}

export default router;
