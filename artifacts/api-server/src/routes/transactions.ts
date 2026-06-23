import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { transactionsTable, usersTable, activityLogsTable, fraudFlagsTable, referralsTable, platformSettingsTable, investmentsTable, plansTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { initiateSTKPush } from "../lib/payhero";

const router = Router();

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Returns true if today (Kenya time) is the last day of the investment */
function isLastDayKE(completesAt: Date | null): boolean {
  if (!completesAt) return false;
  const now = new Date();
  const kenyaNow = new Date(now.getTime() + EAT_OFFSET_MS);
  const kenyaCompletion = new Date(completesAt.getTime() + EAT_OFFSET_MS);
  return kenyaNow.toISOString().slice(0, 10) === kenyaCompletion.toISOString().slice(0, 10);
}

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const txns = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, req.userId!))
    .orderBy(sql`${transactionsTable.createdAt} desc`);
  res.json(txns.map(serializeTxn));
});

/** Lightweight status check used by frontend polling */
router.get("/:id/status", requireAuth, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [txn] = await db
    .select({ id: transactionsTable.id, status: transactionsTable.status, amount: transactionsTable.amount })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, id))
    .limit(1);
  if (!txn || txn === undefined) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: txn.id, status: txn.status, amount: parseFloat(txn.amount) });
});

router.post("/deposit", requireAuth, async (req: AuthRequest, res: Response) => {
  const { amount, phone } = req.body;
  if (!amount || !phone) {
    res.status(400).json({ error: "Amount and phone are required" });
    return;
  }
  if (amount < 10) {
    res.status(400).json({ error: "Minimum deposit is KES 10" });
    return;
  }
  if (!/^(07|01|\+2547|\+2541)\d{8}$/.test(phone.replace(/\s/g, ""))) {
    res.status(400).json({ error: "Invalid M-Pesa phone number" });
    return;
  }

  // Fraud check: multiple large deposits in short window
  const recentLarge = await db
    .select()
    .from(transactionsTable)
    .where(
      sql`${transactionsTable.userId} = ${req.userId} AND ${transactionsTable.type} = 'deposit' AND ${transactionsTable.createdAt} > now() - interval '1 hour' AND ${transactionsTable.amount}::numeric > 50000`
    );

  // Create pending transaction
  const [txn] = await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "deposit",
    amount: String(amount),
    status: "pending",
    method: "mpesa",
    phoneOrAccount: phone,
    reference: `PENDING-${Date.now()}`,
  }).returning();

  // Flag suspicious activity
  if (recentLarge.length > 0 || amount > 100000) {
    await db.insert(fraudFlagsTable).values({
      transactionId: txn.id,
      reason: amount > 100000
        ? "Large deposit exceeds KES 100,000"
        : "Multiple large deposits in 1-hour window",
      severity: amount > 500000 ? "high" : "medium",
    });
    await db.update(transactionsTable).set({ isFlagged: true }).where(eq(transactionsTable.id, txn.id));
  }

  const appUrl =
    process.env["APP_URL"] ??
    `${req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
  const callbackUrl = `${appUrl}/api/transactions/callback/payhero`;

  const [user] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  try {
    const result = await initiateSTKPush({
      amount,
      phone,
      externalReference: `TXN-${txn.id}`,
      callbackUrl,
      customerName: user?.fullName ?? "Customer",
    });

    await db.update(transactionsTable)
      .set({ reference: result.checkoutRequestId })
      .where(eq(transactionsTable.id, txn.id));

    res.json({
      message: "STK push sent. Check your phone for the M-Pesa prompt.",
      transactionId: txn.id,
      checkoutRequestId: result.checkoutRequestId,
    });
  } catch (err) {
    await db.update(transactionsTable)
      .set({ status: "failed" })
      .where(eq(transactionsTable.id, txn.id));

    const message = err instanceof Error ? err.message : "Failed to initiate M-Pesa payment";
    res.status(502).json({ error: message });
  }
});

/**
 * PayHero callback — unauthenticated, called by PayHero servers.
 */
router.post("/callback/payhero", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const externalReference = String(body["external_reference"] ?? "");
  const status = String(body["status"] ?? "").toUpperCase();
  const rawAmount = parseFloat(String(body["amount"] ?? "0"));

  res.json({ received: true });

  if (!externalReference.startsWith("TXN-")) return;
  const txnId = parseInt(externalReference.replace("TXN-", ""));
  if (isNaN(txnId)) return;

  const [txn] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txnId))
    .limit(1);

  if (!txn || txn.status !== "pending") return;

  if (status === "SUCCESS") {
    const confirmedAmount = rawAmount > 0 ? rawAmount : parseFloat(txn.amount);

    await db.update(transactionsTable)
      .set({ status: "completed", amount: String(confirmedAmount), updatedAt: new Date() })
      .where(eq(transactionsTable.id, txnId));

    await db.update(usersTable)
      .set({
        balance: sql`${usersTable.balance} + ${confirmedAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, txn.userId));

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, txn.userId)).limit(1);

    await db.insert(activityLogsTable).values({
      userId: txn.userId,
      userEmail: user?.email ?? "unknown",
      action: "deposit_completed",
      details: `PayHero M-Pesa deposit of KES ${confirmedAmount} confirmed (ref: ${externalReference})`,
      ipAddress: "payhero-callback",
    });

    if (user) {
      (async () => {
        try {
          const { sendMessage } = await import("../lib/whatsapp");
          const amountFmt = confirmedAmount.toLocaleString("en-KE", { minimumFractionDigits: 2 });
          const newBal = parseFloat(user.balance ?? "0") + confirmedAmount;
          const balFmt = newBal.toLocaleString("en-KE", { minimumFractionDigits: 2 });
          const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
          await sendMessage(user.phone,
            `💰 *Deposit Confirmed — Zenti*\n\nHi ${user.fullName},\n\nYour M-Pesa deposit has been received!\n\n` +
            `✅ *Amount:* KES ${amountFmt}\n🏦 *New Balance:* KES ${balFmt}\n📋 *Ref:* ${externalReference}\n🕐 *Time:* ${time}\n\n` +
            `Your funds are ready to invest. Log in to Zenti now! 🚀`
          );
        } catch { /* silent */ }
      })();

      (async () => {
        try {
          const { sendDepositConfirmedEmail } = await import("../lib/email");
          const newBal = parseFloat(user.balance ?? "0") + confirmedAmount;
          await sendDepositConfirmedEmail(
            { email: user.email, name: user.fullName },
            { amount: confirmedAmount, newBalance: newBal, reference: externalReference, method: "M-Pesa" },
          );
        } catch { /* silent */ }
      })();
    }

    // Tier 1 referral bonus: 10% to referrer on first deposit
    const [referral] = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.refereeId, txn.userId))
      .limit(1);

    if (referral && !referral.depositBonusPaid) {
      const bonus = confirmedAmount * 0.10;
      const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referral.referrerId)).limit(1);
      if (referrer) {
        await db.update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${bonus}` })
          .where(eq(usersTable.id, referrer.id));
        await db.update(referralsTable)
          .set({ depositBonusPaid: true })
          .where(eq(referralsTable.refereeId, txn.userId));
        await db.insert(activityLogsTable).values({
          userId: referrer.id,
          userEmail: referrer.email,
          action: "referral_deposit_bonus",
          details: `Referral bonus KES ${bonus.toFixed(2)} (10% of KES ${confirmedAmount} deposit by user #${txn.userId})`,
          ipAddress: "payhero-callback",
        });
      }
    }
  } else {
    await db.update(transactionsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(transactionsTable.id, txnId));
  }
});

router.post("/withdraw", requireAuth, async (req: AuthRequest, res: Response) => {
  const { amount, method, phoneOrAccount } = req.body;
  if (!amount || !method || !phoneOrAccount) {
    res.status(400).json({ error: "Amount, method, and phone/account are required" });
    return;
  }

  const grossAmount = parseFloat(String(amount));
  if (isNaN(grossAmount) || grossAmount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  if (grossAmount < 200) {
    res.status(400).json({ error: "Minimum withdrawal is KES 200" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // ── WITHDRAWAL LOCK ────────────────────────────────────────────────────────
  // Active investments joined with their plan's isInternship flag
  const activeInvestments = await db
    .select({
      id: investmentsTable.id,
      completesAt: investmentsTable.completesAt,
      isInternship: plansTable.isInternship,
    })
    .from(investmentsTable)
    .leftJoin(plansTable, eq(investmentsTable.planId, plansTable.id))
    .where(and(eq(investmentsTable.userId, req.userId!), eq(investmentsTable.status, "active")));

  if (activeInvestments.length === 0) {
    res.status(400).json({
      error: "Withdrawals require an active investment plan. Please deposit and activate a plan first.",
    });
    return;
  }

  const balance = parseFloat(user.balance ?? "0");
  const lockedBalance = parseFloat(user.lockedBalance ?? "0");

  const realInvestments = activeInvestments.filter(i => !i.isInternship);

  let withdrawable: number;
  let isLastDayUnlock = false;

  if (lockedBalance > 0) {
    // User has locked internship earnings — must have a real paid investment to withdraw
    if (realInvestments.length === 0) {
      res.status(400).json({
        error: `Your KES ${lockedBalance.toFixed(0)} internship earnings are locked. Purchase a Premium Plan with a real M-Pesa deposit to unlock your earnings and access withdrawals.`,
      });
      return;
    }

    // Last day of any real investment → full balance unlocks
    const lastDayReal = realInvestments.find(i => isLastDayKE(i.completesAt));
    if (lastDayReal) {
      withdrawable = balance;
      isLastDayUnlock = true;
    } else {
      // Mid-plan: only the amount above the locked portion is withdrawable
      withdrawable = balance - lockedBalance;
      if (withdrawable <= 0) {
        const soonest = realInvestments.reduce((min, i) => {
          if (!i.completesAt) return min;
          return !min || i.completesAt < min.completesAt! ? i : min;
        }, null as typeof realInvestments[0] | null);
        const completionDate = soonest?.completesAt
          ? soonest.completesAt.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", weekday: "long", day: "numeric", month: "long", year: "numeric" })
          : "the last day of your investment";
        res.status(400).json({
          error: `Your balance (KES ${balance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}) does not exceed the locked KES ${lockedBalance.toFixed(0)}. Keep earning until your balance exceeds KES ${lockedBalance.toFixed(0)}, or wait until ${completionDate} to withdraw everything including the locked amount.`,
          withdrawalUnlocksAt: soonest?.completesAt?.toISOString() ?? null,
        });
        return;
      }
    }
  } else {
    // No internship lock: original last-day-only rule for any active investment
    const soonestInvestment = activeInvestments.reduce((min, i) => {
      if (!i.completesAt) return min;
      return !min || i.completesAt < min.completesAt! ? i : min;
    }, null as typeof activeInvestments[0] | null);

    if (!soonestInvestment || !isLastDayKE(soonestInvestment.completesAt)) {
      const completionDate = soonestInvestment?.completesAt
        ? soonestInvestment.completesAt.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", weekday: "long", day: "numeric", month: "long", year: "numeric" })
        : "the last day of your investment";
      res.status(400).json({
        error: `Withdrawals are only available on the last day of your active investment. Your withdrawal window opens on: ${completionDate}.`,
        withdrawalUnlocksAt: soonestInvestment?.completesAt?.toISOString() ?? null,
      });
      return;
    }
    withdrawable = balance;
  }

  if (grossAmount > withdrawable) {
    res.status(400).json({
      error: lockedBalance > 0 && !isLastDayUnlock
        ? `You can only withdraw up to KES ${withdrawable.toLocaleString("en-KE", { minimumFractionDigits: 2 })} (balance minus the locked KES ${lockedBalance.toFixed(0)}).`
        : "Insufficient balance",
    });
    return;
  }

  // Load platform limits
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const feePercent = parseFloat(settings?.withdrawalFeePercent ?? "10");
  const dailyLimitKES = parseFloat(settings?.dailyWithdrawalLimitKES ?? "50000");
  const cooldownHours = settings?.withdrawalCooldownHours ?? 24;

  // ── Cooldown check ────────────────────────────────────────────────────────
  if (cooldownHours > 0) {
    const cooldownCutoff = new Date(Date.now() - cooldownHours * 3_600_000);
    const [last] = await db
      .select({ id: transactionsTable.id, createdAt: transactionsTable.createdAt })
      .from(transactionsTable)
      .where(
        sql`${transactionsTable.userId} = ${req.userId} AND ${transactionsTable.type} = 'withdrawal' AND ${transactionsTable.status} != 'rejected' AND ${transactionsTable.createdAt} > ${cooldownCutoff}`
      )
      .limit(1);
    if (last) {
      const nextAt = new Date(last.createdAt.getTime() + cooldownHours * 3_600_000);
      const nextFmt = nextAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
      res.status(400).json({ error: `You can only withdraw once every ${cooldownHours} hours. Next available: ${nextFmt}` });
      return;
    }
  }

  // ── Daily withdrawal limit ─────────────────────────────────────────────────
  if (dailyLimitKES > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [todaySumRow] = await db
      .select({ sum: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(
        sql`${transactionsTable.userId} = ${req.userId} AND ${transactionsTable.type} = 'withdrawal' AND ${transactionsTable.status} != 'rejected' AND ${transactionsTable.createdAt} >= ${startOfDay}`
      );
    const todaySum = parseFloat(todaySumRow?.sum ?? "0");
    if (todaySum + grossAmount > dailyLimitKES) {
      const remaining = Math.max(0, dailyLimitKES - todaySum);
      res.status(400).json({
        error: `Daily limit of KES ${dailyLimitKES.toLocaleString()} reached. You can withdraw up to KES ${remaining.toLocaleString()} more today.`,
      });
      return;
    }
  }

  // ── Calculate fee ──────────────────────────────────────────────────────────
  const feeAmount = parseFloat((grossAmount * feePercent / 100).toFixed(2));
  const netAmount = parseFloat((grossAmount - feeAmount).toFixed(2));

  // ── Fraud check ────────────────────────────────────────────────────────────
  const recentWithdrawals = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(
      sql`${transactionsTable.userId} = ${req.userId} AND ${transactionsTable.type} = 'withdrawal' AND ${transactionsTable.createdAt} > now() - interval '10 minutes'`
    );

  const [txn] = await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "withdrawal",
    amount: String(grossAmount),
    fee: String(feeAmount),
    status: "pending",
    method: method as "mpesa" | "airtel_money" | "bank",
    phoneOrAccount,
    notes: `Fee: ${feePercent}% (KES ${feeAmount.toFixed(2)}). Net payout: KES ${netAmount.toFixed(2)}`,
  }).returning();

  if (recentWithdrawals.length >= 3) {
    await db.insert(fraudFlagsTable).values({
      transactionId: txn.id,
      reason: "Multiple withdrawal attempts within 10 minutes",
      severity: "high",
    });
    await db.update(transactionsTable).set({ isFlagged: true }).where(eq(transactionsTable.id, txn.id));
  }

  await db.update(usersTable)
    .set({
      balance: String(balance - grossAmount),
      ...(isLastDayUnlock ? { lockedBalance: "0" } : {}),
    })
    .where(eq(usersTable.id, req.userId!));

  await db.insert(activityLogsTable).values({
    userId: req.userId!,
    userEmail: user.email,
    action: "withdrawal_requested",
    details: `Withdrawal KES ${grossAmount} (fee: KES ${feeAmount}, net: KES ${netAmount}) via ${method} to ${phoneOrAccount}`,
    ipAddress: req.ip || "unknown",
  });

  (async () => {
    try {
      const { sendMessage } = await import("../lib/whatsapp");
      const grossFmt = grossAmount.toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const feeFmt = feeAmount.toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const netFmt = netAmount.toLocaleString("en-KE", { minimumFractionDigits: 2 });
      const methodFmt = String(method).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
      await sendMessage(user.phone,
        `📤 *Withdrawal Request — Zenti*\n\nHi ${user.fullName},\n\nYour withdrawal is under review.\n\n` +
        `💰 *Amount:* KES ${grossFmt}\n💸 *Fee (${feePercent}%):* KES ${feeFmt}\n✅ *You receive:* KES ${netFmt}\n📲 *Method:* ${methodFmt}\n🏦 *Account:* ${phoneOrAccount}\n🕐 *Submitted:* ${time}\n\nWe'll notify you once processed. 🙏`
      );
    } catch { /* silent */ }
  })();

  (async () => {
    try {
      const { sendWithdrawalRequestedEmail } = await import("../lib/email");
      await sendWithdrawalRequestedEmail(
        { email: user.email, name: user.fullName },
        { amount: grossAmount, fee: feeAmount, netAmount, method, account: phoneOrAccount, feePercent },
      );
    } catch { /* silent */ }
  })();

  res.status(201).json(serializeTxn(txn));
});

export function serializeTxn(txn: typeof transactionsTable.$inferSelect) {
  return {
    id: txn.id,
    userId: txn.userId,
    type: txn.type,
    amount: parseFloat(txn.amount),
    fee: parseFloat(txn.fee ?? "0"),
    status: txn.status,
    method: txn.method,
    phoneOrAccount: txn.phoneOrAccount,
    reference: txn.reference,
    isFlagged: txn.isFlagged,
    notes: txn.notes,
    createdAt: txn.createdAt,
  };
}

export default router;
