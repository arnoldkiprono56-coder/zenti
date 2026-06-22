import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  investmentsTable,
  plansTable,
  usersTable,
  transactionsTable,
  activityLogsTable,
  claimableEarningsTable,
} from "@workspace/db";
import { eq, and, lte, or, isNull, sql, lt } from "drizzle-orm";

const router = Router();

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function todayKE(): string {
  return new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });
}

function expiryTodayKE(): Date {
  const now = new Date();
  const kenyaNow = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(
    kenyaNow.getUTCFullYear(),
    kenyaNow.getUTCMonth(),
    kenyaNow.getUTCDate(),
    20, 59, 59, 999,
  ));
}

/**
 * POST /api/cron/process-returns
 *
 * Creates claimable daily earnings for all active investments.
 * Users MUST log in and claim by 11:59 PM Kenya time or earnings expire and are lost.
 * On the final day of an investment, earnings are auto-credited and the plan is marked complete.
 * Also expires unclaimed earnings from previous days.
 *
 * Protected by CRON_SECRET env var (Vercel passes as Authorization: Bearer <CRON_SECRET>).
 */
router.all("/process-returns", async (req: Request, res: Response) => {
  const cronSecret = process.env["CRON_SECRET"];

  if (cronSecret) {
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== cronSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const today = todayKE();
  const expiresAt = expiryTodayKE();

  // Step 1: Expire unclaimed earnings from previous days
  await db
    .update(claimableEarningsTable)
    .set({ expired: true })
    .where(
      and(
        eq(claimableEarningsTable.claimed, false),
        eq(claimableEarningsTable.expired, false),
        lt(claimableEarningsTable.expiresAt, now),
      )
    );

  // Step 2: Find active investments due for crediting
  const dueInvestments = await db
    .select()
    .from(investmentsTable)
    .where(
      and(
        eq(investmentsTable.status, "active"),
        or(
          isNull(investmentsTable.lastEarningAt),
          lte(investmentsTable.lastEarningAt, cutoff),
        ),
      ),
    );

  if (dueInvestments.length === 0) {
    res.json({ processed: 0, completed: 0, message: "No investments due for crediting" });
    return;
  }

  let processed = 0;
  let completed = 0;
  const errors: string[] = [];

  for (const inv of dueInvestments) {
    try {
      const dailyEarning = parseFloat(inv.dailyEarning ?? "0");
      const totalEarned = parseFloat(inv.totalEarned ?? "0");
      const expectedTotal = parseFloat(inv.expectedTotal ?? "0");

      const newTotalEarned = totalEarned + dailyEarning;
      const isComplete =
        (inv.completesAt != null && inv.completesAt <= now) ||
        newTotalEarned >= expectedTotal;

      await db
        .update(investmentsTable)
        .set({
          totalEarned: String(Math.min(newTotalEarned, expectedTotal)),
          lastEarningAt: now,
          ...(isComplete ? { status: "completed" } : {}),
        })
        .where(eq(investmentsTable.id, inv.id));

      if (isComplete) {
        // Final day: auto-credit earnings and mark complete
        await db
          .update(usersTable)
          .set({
            balance: sql`${usersTable.balance} + ${dailyEarning}`,
            totalEarned: sql`${usersTable.totalEarned} + ${dailyEarning}`,
            updatedAt: now,
          })
          .where(eq(usersTable.id, inv.userId));

        // Auto-claim any pending claimable for this investment
        await db
          .update(claimableEarningsTable)
          .set({ claimed: true, claimedAt: now })
          .where(
            and(
              eq(claimableEarningsTable.investmentId, inv.id),
              eq(claimableEarningsTable.claimed, false),
              eq(claimableEarningsTable.expired, false),
            )
          );

        await db.insert(transactionsTable).values({
          userId: inv.userId,
          type: "earning",
          amount: String(dailyEarning),
          status: "completed",
          notes: `Final daily return auto-credited (investment #${inv.id} completed)`,
        });

        await db.insert(activityLogsTable).values({
          userId: inv.userId,
          userEmail: "system",
          action: "earning_credited",
          details: `KES ${dailyEarning.toFixed(2)} auto-credited — investment #${inv.id} completed`,
          ipAddress: "cron",
        });

        // Completion WhatsApp notification
        (async () => {
          try {
            const { sendMessage } = await import("../lib/whatsapp");
            const [usr] = await db
              .select({ phone: usersTable.phone, fullName: usersTable.fullName, balance: usersTable.balance, email: usersTable.email })
              .from(usersTable).where(eq(usersTable.id, inv.userId)).limit(1);
            if (!usr) return;
            const totalFmt = parseFloat(inv.expectedTotal ?? "0").toLocaleString("en-KE", { minimumFractionDigits: 2 });
            const newBal = (parseFloat(usr.balance ?? "0")).toLocaleString("en-KE", { minimumFractionDigits: 2 });
            await sendMessage(usr.phone,
              `🏆 *Investment Completed — Zenti*\n\nCongratulations ${usr.fullName}!\n\nYour plan has matured and all earnings credited.\n\n` +
              `💵 *Total Earned:* KES ${totalFmt}\n🏦 *New Balance:* KES ${newBal}\n\n` +
              `💡 *Today is your withdrawal day!* You can now withdraw your earnings.\n\n` +
              `Ready to grow more? Start a new plan today! 🚀`
            );
          } catch { /* silent */ }
        })();

        // Completion email
        (async () => {
          try {
            const { sendInvestmentCompletedEmail } = await import("../lib/email");
            const [usr] = await db
              .select({ email: usersTable.email, fullName: usersTable.fullName, balance: usersTable.balance })
              .from(usersTable).where(eq(usersTable.id, inv.userId)).limit(1);
            if (!usr?.email) return;
            // Determine if internship by querying the plan
            const [plan] = await db.select({ isInternship: plansTable.isInternship, name: plansTable.name })
              .from(plansTable).where(eq(plansTable.id, inv.planId)).limit(1);
            await sendInvestmentCompletedEmail(
              { email: usr.email, name: usr.fullName },
              {
                totalEarned: parseFloat(inv.expectedTotal ?? "0"),
                newBalance: parseFloat(usr.balance ?? "0"),
                isInternship: plan?.isInternship ?? false,
                planName: plan?.name,
              },
            );
          } catch { /* silent */ }
        })();

        completed++;
      } else {
        // Non-final day: create claimable earning (user must claim by 11:59 PM)
        const existing = await db
          .select({ id: claimableEarningsTable.id })
          .from(claimableEarningsTable)
          .where(
            and(
              eq(claimableEarningsTable.investmentId, inv.id),
              eq(claimableEarningsTable.earningDate, today),
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(claimableEarningsTable).values({
            userId: inv.userId,
            investmentId: inv.id,
            amount: String(dailyEarning),
            earningDate: today,
            expiresAt,
          });
        }

        await db.insert(activityLogsTable).values({
          userId: inv.userId,
          userEmail: "system",
          action: "claimable_earning_created",
          details: `KES ${dailyEarning.toFixed(2)} claimable earning created for investment #${inv.id} — expires 11:59 PM EAT`,
          ipAddress: "cron",
        });

        // Notify user to claim
        (async () => {
          try {
            const { sendMessage } = await import("../lib/whatsapp");
            const [usr] = await db
              .select({ phone: usersTable.phone, fullName: usersTable.fullName })
              .from(usersTable).where(eq(usersTable.id, inv.userId)).limit(1);
            if (!usr) return;
            const earningFmt = dailyEarning.toLocaleString("en-KE", { minimumFractionDigits: 2 });
            await sendMessage(usr.phone,
              `💸 *Daily Earning Ready — Zenti*\n\nHi ${usr.fullName},\n\nYour daily earning of *KES ${earningFmt}* is ready!\n\n` +
              `⚠️ *CLAIM IT NOW — Expires at 11:59 PM tonight!*\n\n` +
              `Unclaimed earnings are permanently lost. Log in now and tap "Claim Earnings"! 👉`
            );
          } catch { /* silent */ }
        })();

        // Claim reminder email
        (async () => {
          try {
            const { sendClaimReminderEmail } = await import("../lib/email");
            const [usr] = await db
              .select({ email: usersTable.email, fullName: usersTable.fullName })
              .from(usersTable).where(eq(usersTable.id, inv.userId)).limit(1);
            if (!usr?.email) return;
            await sendClaimReminderEmail(
              { email: usr.email, name: usr.fullName },
              { earned: dailyEarning, expiresAt },
            );
          } catch { /* silent */ }
        })();
      }

      processed++;
    } catch (err) {
      errors.push(`investment #${inv.id}: ${String(err)}`);
    }
  }

  res.json({
    processed,
    completed,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
});

export default router;
