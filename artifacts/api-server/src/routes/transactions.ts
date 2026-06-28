import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { transactionsTable, usersTable, activityLogsTable, fraudFlagsTable, referralsTable, platformSettingsTable, investmentsTable, plansTable, ticketsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { initiateSTKPush } from "../lib/payhero";
import { createTicket, closeTicket } from "../lib/tickets";
import { logger } from "../lib/logger";

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
  if (amount < 1) {
    res.status(400).json({ error: "Minimum deposit is KES 1" });
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

  // Create deposit ticket
  const ticket = await createTicket({
    type: "deposit",
    userId: req.userId!,
    relatedId: txn.id,
    metadata: { amount, phone, status: "initiated" },
  });

  // Store ticket number in transaction notes
  await db.update(transactionsTable)
    .set({ notes: `Ticket: ${ticket.ticketNumber}` })
    .where(eq(transactionsTable.id, txn.id));

  const appBase =
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    (() => {
      const proto =
        (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ??
        req.protocol;
      const host =
        (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ??
        req.get("host");
      return `${proto}://${host}`;
    })();
  const callbackUrl = `${appBase.replace(/\/$/, "")}/api/transactions/callback/payhero`;

  const [user] = await db.select({ fullName: usersTable.fullName, email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  // Send deposit initiated email (fire-and-forget)
  if (user?.email) {
    (async () => {
      try {
        const { sendDepositInitiatedEmail } = await import("../lib/email");
        await sendDepositInitiatedEmail(
          { email: user.email, name: user.fullName },
          { amount, phone, ticketNumber: ticket.ticketNumber },
        );
      } catch { /* silent */ }
    })();
  }

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
      ticketNumber: ticket.ticketNumber,
      checkoutRequestId: result.checkoutRequestId,
    });
  } catch (err) {
    await db.update(transactionsTable)
      .set({ status: "failed" })
      .where(eq(transactionsTable.id, txn.id));

    // Close the ticket as resolved (failed)
    await closeTicket(ticket.id, "resolved");

    // Send deposit failed email
    if (user?.email) {
      (async () => {
        try {
          const { sendDepositFailedEmail } = await import("../lib/email");
          const message = err instanceof Error ? err.message : "Failed to initiate M-Pesa payment";
          await sendDepositFailedEmail(
            { email: user.email, name: user.fullName },
            { amount, phone, ticketNumber: ticket.ticketNumber, reason: message },
          );
        } catch { /* silent */ }
      })();
    }

    const message = err instanceof Error ? err.message : "Failed to initiate M-Pesa payment";
    res.status(502).json({ error: message });
  }
});

/**
 * PayHero callback — unauthenticated, called by PayHero servers.
 */
router.post("/callback/payhero", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  // PayHero wraps the real data inside a "response" key with PascalCase field names.
  // Fall back to the top-level body in case the shape changes.
  const r = ((body["response"] ?? body) as Record<string, unknown>);

  const externalReference = String(
    r["ExternalReference"] ?? r["external_reference"] ??
    body["ExternalReference"] ?? body["external_reference"] ?? ""
  );
  const resultCode = Number(r["ResultCode"] ?? r["result_code"] ?? -1);
  const statusStr = String(r["Status"] ?? r["status"] ?? body["status"] ?? "").toLowerCase();
  const rawAmount = parseFloat(String(r["Amount"] ?? r["amount"] ?? body["amount"] ?? "0"));
  const mpesaReceipt = String(r["MpesaReceiptNumber"] ?? r["mpesa_receipt_number"] ?? "");
  const isSuccess = resultCode === 0 || statusStr === "success";

  logger.info({ externalReference, resultCode, statusStr, rawAmount, isSuccess, body }, "PayHero callback received");

  res.json({ received: true });

  if (!externalReference.startsWith("TXN-")) {
    logger.warn({ externalReference, body }, "PayHero callback: unrecognised external_reference, ignoring");
    return;
  }
  const txnId = parseInt(externalReference.replace("TXN-", ""));
  if (isNaN(txnId)) return;

  const [txn] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txnId))
    .limit(1);

  if (!txn || txn.status !== "pending") return;

  // Extract ticket number from transaction notes
  const ticketNumber = txn.notes?.match(/Ticket: (ZEN-\d{8}-\d{5})/)?.[1];

  if (isSuccess) {
    const confirmedAmount = rawAmount > 0 ? rawAmount : parseFloat(txn.amount);

    await db.update(transactionsTable)
      .set({ status: "completed", amount: String(confirmedAmount), updatedAt: new Date() })
      .where(eq(transactionsTable.id, txnId));

    await db.update(usersTable)
      .set({
        balance: sql`${usersTable.balance} + ${confirmedAmount}`,
        dormancyStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, txn.userId));

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, txn.userId)).limit(1);

    await db.insert(activityLogsTable).values({
      userId: txn.userId,
      userEmail: user?.email ?? "unknown",
      action: "deposit_completed",
      details: `PayHero M-Pesa deposit of KES ${confirmedAmount} confirmed (ref: ${externalReference})${ticketNumber ? ` [${ticketNumber}]` : ""}`,
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
            `✅ *Amount:* KES ${amountFmt}\n🏦 *New Balance:* KES ${balFmt}\n📋 *Ref:* ${externalReference}\n🕐 *Time:* ${time}\n` +
            `${ticketNumber ? `🎫 *Ticket:* ${ticketNumber}\n` : ""}\n` +
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
            { amount: confirmedAmount, newBalance: newBal, reference: externalReference, method: "M-Pesa", ticketNumber },
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

    // Send deposit failed email
    const [user] = await db.select({ email: usersTable.email, fullName: usersTable.fullName, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, txn.userId)).limit(1);
    if (user?.email && ticketNumber) {
      (async () => {
        try {
          const { sendDepositFailedEmail } = await import("../lib/email");
          const amount = parseFloat(txn.amount);
          const failReason = String(r["ResultDesc"] ?? r["result_desc"] ?? body["failure_reason"] ?? body["result_description"] ?? "Payment was cancelled or timed out");
          await sendDepositFailedEmail(
            { email: user.email, name: user.fullName },
            { amount, phone: txn.phoneOrAccount ?? user.phone, ticketNumber, reason: failReason },
          );
        } catch { /* silent */ }
      })();
    }
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
    if (realInvestments.length === 0) {
      res.status(400).json({
        error: `Your KES ${lockedBalance.toFixed(0)} internship earnings are locked. Purchase a Premium Plan with a real M-Pesa deposit to unlock your earnings and access withdrawals.`,
      });
      return;
    }

    const lastDayReal = realInvestments.find(i => isLastDayKE(i.completesAt));
    if (lastDayReal) {
      withdrawable = balance;
      isLastDayUnlock = true;
    } else {
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

  // Create withdrawal ticket
  const ticket = await createTicket({
    type: "withdrawal",
    userId: req.userId!,
    metadata: { grossAmount, feeAmount, netAmount, method, account: phoneOrAccount },
  });

  const [txn] = await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "withdrawal",
    amount: String(grossAmount),
    fee: String(feeAmount),
    status: "pending",
    method: method as "mpesa" | "airtel_money" | "bank",
    phoneOrAccount,
    notes: `Fee: ${feePercent}% (KES ${feeAmount.toFixed(2)}). Net payout: KES ${netAmount.toFixed(2)}. Ticket: ${ticket.ticketNumber}`,
  }).returning();

  // Update ticket with relatedId now that we have transaction ID
  await db.update(ticketsTable)
    .set({ relatedId: txn.id, updatedAt: new Date() })
    .where(eq(ticketsTable.id, ticket.id));

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
    details: `Withdrawal KES ${grossAmount} (fee: KES ${feeAmount}, net: KES ${netAmount}) via ${method} to ${phoneOrAccount} [${ticket.ticketNumber}]`,
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
        `💰 *Amount:* KES ${grossFmt}\n💸 *Fee (${feePercent}%):* KES ${feeFmt}\n✅ *You receive:* KES ${netFmt}\n📲 *Method:* ${methodFmt}\n🏦 *Account:* ${phoneOrAccount}\n🕐 *Submitted:* ${time}\n🎫 *Ticket:* ${ticket.ticketNumber}\n\nWe'll notify you once processed. 🙏`
      );
    } catch { /* silent */ }
  })();

  (async () => {
    try {
      const { sendWithdrawalRequestedEmail } = await import("../lib/email");
      await sendWithdrawalRequestedEmail(
        { email: user.email, name: user.fullName },
        { amount: grossAmount, fee: feeAmount, netAmount, method, account: phoneOrAccount, feePercent, ticketNumber: ticket.ticketNumber },
      );
    } catch { /* silent */ }
  })();

  res.status(201).json({ ...serializeTxn(txn), ticketNumber: ticket.ticketNumber });
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
