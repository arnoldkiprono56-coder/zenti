import { Router, Response } from "express";
import { db } from "@workspace/db";
import { usersTable, investmentsTable, transactionsTable, plansTable, claimableEarningsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";

const router = Router();

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Returns true if today (Kenya time) is the last day of the investment */
function isLastDayKE(completesAt: Date | null): boolean {
  if (!completesAt) return false;
  const now = new Date();
  const kenyaNow = new Date(now.getTime() + EAT_OFFSET_MS);
  const kenyaCompletion = new Date(completesAt.getTime() + EAT_OFFSET_MS);
  const todayStr = kenyaNow.toISOString().slice(0, 10);
  const completionStr = kenyaCompletion.toISOString().slice(0, 10);
  return todayStr === completionStr;
}

router.get("/summary", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  const activeInvestments = await db
    .select()
    .from(investmentsTable)
    .where(and(eq(investmentsTable.userId, req.userId!), eq(investmentsTable.status, "active")));

  const totalInvested = activeInvestments.reduce((sum, i) => sum + parseFloat(i.amountInvested ?? "0"), 0);

  const pendingWithdrawals = await db
    .select()
    .from(transactionsTable)
    .where(
      sql`${transactionsTable.userId} = ${req.userId} AND ${transactionsTable.type} = 'withdrawal' AND ${transactionsTable.status} = 'pending'`
    );
  const pendingWithdrawalsAmt = pendingWithdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0);

  // Today's claimed earnings (via claimable_earnings table)
  const todayKE = new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });
  const todayClaimedRows = await db
    .select({ amount: claimableEarningsTable.amount })
    .from(claimableEarningsTable)
    .where(
      and(
        eq(claimableEarningsTable.userId, req.userId!),
        eq(claimableEarningsTable.claimed, true),
        eq(claimableEarningsTable.earningDate, todayKE),
      )
    );
  const todayEarningsAmt = todayClaimedRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  // Claimable earnings today (unclaimed + not expired)
  const now = new Date();
  const claimableRows = await db
    .select({ amount: claimableEarningsTable.amount })
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
  const claimableTotal = claimableRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  // Withdrawal availability: only allowed on last day of active investment
  let canWithdraw = false;
  let withdrawalUnlocksAt: string | null = null;
  if (activeInvestments.length > 0) {
    const soonestCompletion = activeInvestments.reduce((min, i) => {
      if (!i.completesAt) return min;
      return !min || i.completesAt < min ? i.completesAt : min;
    }, null as Date | null);
    canWithdraw = isLastDayKE(soonestCompletion);
    withdrawalUnlocksAt = soonestCompletion?.toISOString() ?? null;
  }

  // Internship progress — fixed: filter by internship plan
  let internshipProgress: number | null = null;
  if (user.internshipActivated) {
    const internshipPlanIds = await db
      .select({ id: plansTable.id })
      .from(plansTable)
      .where(eq(plansTable.isInternship, true));
    const internshipPlanIdSet = new Set(internshipPlanIds.map(p => p.id));

    const internshipInv = activeInvestments.find(i => internshipPlanIdSet.has(i.planId));
    if (internshipInv) {
      const earned = parseFloat(internshipInv.totalEarned ?? "0");
      const expected = parseFloat(internshipInv.expectedTotal ?? "200");
      internshipProgress = Math.min(100, (earned / expected) * 100);
    }
  }

  res.json({
    balance: parseFloat(user.balance ?? "0"),
    totalInvested,
    totalEarned: parseFloat(user.totalEarned ?? "0"),
    activeInvestments: activeInvestments.length,
    pendingWithdrawals: pendingWithdrawalsAmt,
    todayEarnings: todayEarningsAmt,
    claimableTotal,
    canWithdraw,
    withdrawalUnlocksAt,
    internshipProgress,
  });
});

export default router;
