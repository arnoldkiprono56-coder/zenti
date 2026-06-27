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
import { eq, and, lte, or, isNull, sql, lt, isNotNull, ne } from "drizzle-orm";
import { runFraudSweep } from "../lib/auto-ban";
import { createTicket } from "../lib/tickets";

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
    // Still run dormancy check even if no investments
    runDormancyCheck().catch(console.error);
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
        const [completedPlan] = await db
          .select({ isInternship: plansTable.isInternship, name: plansTable.name })
          .from(plansTable).where(eq(plansTable.id, inv.planId)).limit(1);
        const isInternshipPlan = completedPlan?.isInternship ?? false;

        await db
          .update(usersTable)
          .set({
            balance: sql`${usersTable.balance} + ${dailyEarning}`,
            totalEarned: sql`${usersTable.totalEarned} + ${dailyEarning}`,
            ...(isInternshipPlan ? { lockedBalance: sql`${usersTable.lockedBalance} + ${dailyEarning}` } : {}),
            updatedAt: now,
          })
          .where(eq(usersTable.id, inv.userId));

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

        (async () => {
          try {
            const { sendMessage } = await import("../lib/whatsapp");
            const [usr] = await db
              .select({ phone: usersTable.phone, fullName: usersTable.fullName, balance: usersTable.balance, email: usersTable.email })
              .from(usersTable).where(eq(usersTable.id, inv.userId)).limit(1);
            if (!usr) return;
            const totalFmt = parseFloat(inv.expectedTotal ?? "0").toLocaleString("en-KE", { minimumFractionDigits: 2 });
            const newBal = (parseFloat(usr.balance ?? "0")).toLocaleString("en-KE", { minimumFractionDigits: 2 });
            if (isInternshipPlan) {
              await sendMessage(usr.phone,
                `🎓 *Internship Completed — Zenti*\n\nCongratulations ${usr.fullName}!\n\nYour 2-Day Internship Package has matured!\n\n` +
                `💵 *Total Earned:* KES ${totalFmt}\n🏦 *Wallet Balance:* KES ${newBal}\n\n` +
                `🔒 *Your KES 200 is locked in your wallet.*\n\n` +
                `To unlock and withdraw your earnings, you must purchase a Premium Plan with a real M-Pesa deposit.\n\n` +
                `👉 Log in now and invest to start growing your wealth! 🚀`
              );
            } else {
              await sendMessage(usr.phone,
                `🏆 *Investment Completed — Zenti*\n\nCongratulations ${usr.fullName}!\n\nYour plan has matured and all earnings credited.\n\n` +
                `💵 *Total Earned:* KES ${totalFmt}\n🏦 *New Balance:* KES ${newBal}\n\n` +
                `💡 *Today is your withdrawal day!* You can now withdraw your earnings.\n\n` +
                `Ready to grow more? Start a new plan today! 🚀`
              );
            }
          } catch { /* silent */ }
        })();

        (async () => {
          try {
            const { sendInvestmentCompletedEmail } = await import("../lib/email");
            const [usr] = await db
              .select({ email: usersTable.email, fullName: usersTable.fullName, balance: usersTable.balance })
              .from(usersTable).where(eq(usersTable.id, inv.userId)).limit(1);
            if (!usr?.email) return;
            await sendInvestmentCompletedEmail(
              { email: usr.email, name: usr.fullName },
              {
                totalEarned: parseFloat(inv.expectedTotal ?? "0"),
                newBalance: parseFloat(usr.balance ?? "0"),
                isInternship: isInternshipPlan,
                planName: completedPlan?.name,
              },
            );
          } catch { /* silent */ }
        })();

        completed++;
      } else {
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

  // Dormancy check runs in background
  runDormancyCheck().catch(console.error);

  // Run daily fraud sweep in background
  (async () => {
    try {
      const sweep = await runFraudSweep();
      if (sweep.banned > 0) {
        await db.insert(activityLogsTable).values({
          userId: 0,
          userEmail: "system",
          action: "fraud_sweep_completed",
          details: `Daily fraud sweep: checked ${sweep.checked} accounts, banned ${sweep.banned}`,
          ipAddress: "cron",
        });
      }
    } catch (err) {
      console.error("[FraudSweep] Failed:", err instanceof Error ? err.message : err);
    }
  })();

  res.json({
    processed,
    completed,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
});

/**
 * Dormancy logic (replaces the old 24-hour unverified suspension):
 * - Users with no real M-Pesa deposit AND no active investment get a 14-day countdown
 * - Day 7: warning email
 * - Day 14: status → dormant
 * - On login: dormancyStartedAt is reset (handled in auth route)
 */
async function runDormancyCheck(): Promise<void> {
  try {
    const now = new Date();

    // Find all active regular users with no active investment and no completed deposit
    const candidateUsers = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
        phone: usersTable.phone,
        createdAt: usersTable.createdAt,
        dormancyStartedAt: usersTable.dormancyStartedAt,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, "active"),
          eq(usersTable.role, "user"),
        )
      );

    for (const u of candidateUsers) {
      // Check if user has any completed M-Pesa deposit
      const [deposit] = await db
        .select({ id: transactionsTable.id })
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.userId, u.id),
            eq(transactionsTable.type, "deposit"),
            eq(transactionsTable.status, "completed"),
          )
        )
        .limit(1);

      // Check if user has any active investment
      const [activeInv] = await db
        .select({ id: investmentsTable.id })
        .from(investmentsTable)
        .where(
          and(
            eq(investmentsTable.userId, u.id),
            eq(investmentsTable.status, "active"),
          )
        )
        .limit(1);

      if (deposit || activeInv) {
        // User is engaged — clear dormancy countdown if set
        if (u.dormancyStartedAt) {
          await db.update(usersTable)
            .set({ dormancyStartedAt: null, updatedAt: now })
            .where(eq(usersTable.id, u.id));
        }
        continue;
      }

      // User has no deposit and no active plan — start or continue dormancy countdown
      if (!u.dormancyStartedAt) {
        // Start the countdown from today
        await db.update(usersTable)
          .set({ dormancyStartedAt: now, updatedAt: now })
          .where(eq(usersTable.id, u.id));
        console.log(`[Dormancy] Started countdown for user #${u.id}`);
        // Send day-0 countdown start email
        (async () => {
          try {
            const { sendEmailNotification } = await import("../lib/email");
            await sendEmailNotification({
              email: u.email,
              name: u.fullName,
              subject: "Action Required: Your Zenti account will close in 14 days",
              heading: "Account Activity Required",
              icon: "⏰",
              body: `<p>Hi <strong>${u.fullName}</strong>,</p>
<p>We noticed you haven't made a deposit or started an investment on Zenti yet.</p>
<p>Your account will be <strong>temporarily closed in 14 days</strong> if no activity is recorded.</p>
<div style="background:#fff7ed;border:2px solid #fb923c;border-radius:12px;padding:18px 20px;margin:18px 0;">
  <p style="margin:0 0 10px;font-weight:700;color:#9a3412;">To keep your account active, simply:</p>
  <ul style="margin:0;padding-left:20px;color:#7c2d12;">
    <li>Make your first M-Pesa deposit and activate an investment plan, <strong>OR</strong></li>
    <li>Activate the free 2-Day Internship Package (no deposit needed)</li>
  </ul>
</div>
<p>Your account is <strong>NOT deleted</strong> — you can reactivate it instantly at any time by logging in.</p>
<p>Log in now to get started: <a href="${process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app"}" style="color:#16a34a;font-weight:700;">${process.env.APP_URL || process.env.FRONTEND_URL || "Zenti"}</a></p>`,
            });
          } catch { /* silent */ }
        })();
        continue;
      }

      const daysSince = Math.floor((now.getTime() - u.dormancyStartedAt.getTime()) / (24 * 60 * 60 * 1000));

      if (daysSince >= 14) {
        // Close the account
        await db.update(usersTable)
          .set({ status: "dormant", updatedAt: now })
          .where(eq(usersTable.id, u.id));

        await db.insert(activityLogsTable).values({
          userId: u.id,
          userEmail: u.email,
          action: "account_dormant",
          details: `Account closed due to 14 days inactivity (no deposit, no investment)`,
          ipAddress: "cron",
        });

        // Create dormancy ticket
        const ticket = await createTicket({
          type: "dormancy",
          userId: u.id,
          metadata: { reason: "14-day inactivity — no deposit or investment" },
        });

        (async () => {
          try {
            const { sendEmailNotification } = await import("../lib/email");
            await sendEmailNotification({
              email: u.email,
              name: u.fullName,
              subject: "Your Zenti account has been temporarily closed",
              heading: "Account Temporarily Closed",
              icon: "😴",
              body: `Your account was temporarily closed due to 14 days of inactivity — no deposit or active investment was found.\n\nYour account is <strong>NOT deleted</strong>. Simply log in to reactivate it instantly and start your journey.`,
              ticketNumber: ticket.ticketNumber,
            });
          } catch { /* silent */ }
        })();

        console.log(`[Dormancy] Closed account for user #${u.id} after ${daysSince} days`);

      } else if (daysSince === 7) {
        // Send 7-day warning
        const ticket = await createTicket({
          type: "dormancy",
          userId: u.id,
          metadata: { warning: "7-day dormancy warning", daysUntilClosure: 7 },
        });

        (async () => {
          try {
            const { sendDormancyWarningEmail } = await import("../lib/email");
            await sendDormancyWarningEmail(
              { email: u.email, name: u.fullName },
              { daysUntilClosure: 7, ticketNumber: ticket.ticketNumber },
            );
          } catch { /* silent */ }
        })();

        console.log(`[Dormancy] Sent 7-day warning to user #${u.id}`);
      }
    }
  } catch (err) {
    console.error("[Dormancy] Check failed:", err instanceof Error ? err.message : err);
  }
}

export default router;
