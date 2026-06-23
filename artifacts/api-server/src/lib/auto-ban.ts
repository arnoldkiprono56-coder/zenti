import { db } from "@workspace/db";
import {
  usersTable,
  activityLogsTable,
  referralsTable,
  transactionsTable,
} from "@workspace/db";
import { eq, and, ne, gte, lt, sql, count, inArray } from "drizzle-orm";
import { isDisposableEmail } from "./disposable-domains";

const SUPPORT_EMAIL = "support@zenti.run.place";
const SITE_URL = "https://zenti.run.place";

export interface BanResult {
  banned: boolean;
  reason?: string;
  accountsAffected?: number;
}

async function banUser(userId: number, reason: string, triggerIp: string): Promise<void> {
  const now = new Date();
  await db
    .update(usersTable)
    .set({ status: "banned", bannedReason: reason, bannedAt: now, updatedAt: now })
    .where(eq(usersTable.id, userId));

  const [user] = await db
    .select({ email: usersTable.email, fullName: usersTable.fullName, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  await db.insert(activityLogsTable).values({
    userId,
    userEmail: user?.email ?? "unknown",
    action: "account_auto_banned",
    details: `Auto-banned: ${reason}`,
    ipAddress: triggerIp,
  });

  if (user?.email) {
    (async () => {
      try {
        const { sendAccountBannedEmail } = await import("./email");
        await sendAccountBannedEmail(
          { email: user.email, name: user.fullName },
          { reason, supportEmail: SUPPORT_EMAIL, siteUrl: SITE_URL },
        );
      } catch { /* silent */ }
    })();
  }
}

export async function autoBanCheck(
  newUserId: number,
  phone: string,
  ip: string,
  fingerprint: string,
  email?: string,
  referredById?: number,
): Promise<BanResult> {
  const now = new Date();
  let bannedCount = 0;

  /* ── Rule 1: Duplicate phone number ──────────────────────────────── */
  const phoneDups = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(and(eq(usersTable.phone, phone), ne(usersTable.id, newUserId)));

  if (phoneDups.length > 0) {
    const reason = "Multiple accounts registered with the same phone number. Only one account is allowed per phone number.";
    await banUser(newUserId, reason, ip);
    bannedCount++;
    for (const dup of phoneDups.filter(d => d.status !== "banned")) {
      await banUser(dup.id, "Account associated with a phone number used to create a duplicate account.", ip);
      bannedCount++;
    }
    return { banned: true, reason, accountsAffected: bannedCount };
  }

  /* ── Rule 2: IP flood — more than 2 accounts from same IP in 1 hour ─ */
  if (ip && ip !== "unknown" && ip !== "::1" && ip !== "127.0.0.1") {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const ipAccounts = await db
      .select({ id: usersTable.id, status: usersTable.status })
      .from(usersTable)
      .where(and(
        eq(usersTable.registrationIp, ip),
        gte(usersTable.createdAt, oneHourAgo),
        ne(usersTable.id, newUserId),
        ne(usersTable.status, "banned"),
      ));

    if (ipAccounts.length >= 2) {
      const reason = `Suspicious activity: multiple accounts registered from the same network within a short period. IP: ${ip}`;
      await banUser(newUserId, reason, ip);
      bannedCount++;
      for (const acct of ipAccounts) {
        await banUser(acct.id, "Account created in a bulk registration pattern from a shared IP address.", ip);
        bannedCount++;
      }
      return { banned: true, reason, accountsAffected: bannedCount };
    }
  }

  /* ── Rule 3: Device fingerprint flood — more than 2 accounts in 24h ─ */
  if (fingerprint) {
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fpAccounts = await db
      .select({ id: usersTable.id, status: usersTable.status })
      .from(usersTable)
      .where(and(
        eq(usersTable.deviceFingerprint, fingerprint),
        gte(usersTable.createdAt, twentyFourHoursAgo),
        ne(usersTable.id, newUserId),
        ne(usersTable.status, "banned"),
      ));

    if (fpAccounts.length >= 2) {
      const reason = "Multiple accounts detected from the same device within 24 hours.";
      await banUser(newUserId, reason, ip);
      bannedCount++;
      for (const acct of fpAccounts) {
        await banUser(acct.id, "Account created as part of a device-based multi-account pattern.", ip);
        bannedCount++;
      }
      return { banned: true, reason, accountsAffected: bannedCount };
    }
  }

  /* ── Rule 4: Referral fraud — 5+ referrals with no real deposit ──── */
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const [newUser] = await db
    .select({ createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, newUserId))
    .limit(1);

  if (newUser && new Date(newUser.createdAt) < fortyEightHoursAgo) {
    const r4 = await checkReferralFraud(newUserId, ip);
    if (r4.banned) return r4;
  }

  /* ── Rule 5: Disposable/throwaway email ──────────────────────────── */
  if (email && isDisposableEmail(email)) {
    const reason = "Registration attempted with a known disposable/temporary email address. Please use a real email.";
    await banUser(newUserId, reason, ip);
    return { banned: true, reason, accountsAffected: 1 };
  }

  /* ── Rule 6: Self-referral — referee shares fingerprint or IP with referrer ─ */
  if (referredById) {
    const r6 = await checkSelfReferral(newUserId, referredById, fingerprint, ip);
    if (r6.banned) return r6;
  }

  /* ── Rule 7: Registration time clustering — bot-like burst ─────── */
  if (ip && ip !== "unknown" && ip !== "::1" && ip !== "127.0.0.1") {
    const r7 = await checkRegistrationClustering(newUserId, now, fingerprint);
    if (r7.banned) return r7;
  }

  return { banned: false };
}

/* ── Standalone checks (also called from cron sweep) ──────────────── */

export async function checkReferralFraud(userId: number, ip = "system"): Promise<BanResult> {
  const [row] = await db
    .select({ cnt: count() })
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, userId));
  const total = Number(row?.cnt ?? 0);
  if (total < 5) return { banned: false };

  const [realDeposit] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.type, "deposit"),
      eq(transactionsTable.status, "completed"),
      eq(transactionsTable.method, "mpesa"),
    ))
    .limit(1);

  if (realDeposit) return { banned: false };

  const reason = `Referral abuse: account recruited ${total} user(s) without any real M-Pesa deposit. Referral rewards require genuine platform participation.`;
  await banUser(userId, reason, ip);
  return { banned: true, reason, accountsAffected: 1 };
}

export async function checkSelfReferral(refereeId: number, referrerId: number, fingerprint: string, ip: string): Promise<BanResult> {
  const [referrer] = await db
    .select({ registrationIp: usersTable.registrationIp, deviceFingerprint: usersTable.deviceFingerprint })
    .from(usersTable)
    .where(eq(usersTable.id, referrerId))
    .limit(1);

  if (!referrer) return { banned: false };

  const sameDevice = fingerprint && referrer.deviceFingerprint && fingerprint === referrer.deviceFingerprint;
  const sameIp = ip && ip !== "unknown" && ip !== "::1" && ip !== "127.0.0.1"
    && referrer.registrationIp && ip === referrer.registrationIp;

  if (sameDevice || sameIp) {
    const reason = `Self-referral detected: the referee account shares the same ${sameDevice ? "device" : "IP address"} as the referrer (user #${referrerId}). Referral abuse is not permitted.`;
    await banUser(refereeId, reason, ip);
    await banUser(referrerId, `Self-referral abuse: created a duplicate account to claim referral rewards. Matched by ${sameDevice ? "device" : "IP"}.`, ip);
    return { banned: true, reason, accountsAffected: 2 };
  }

  return { banned: false };
}

async function checkRegistrationClustering(newUserId: number, now: Date, fingerprint: string): Promise<BanResult> {
  const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
  const burst = await db
    .select({ id: usersTable.id, deviceFingerprint: usersTable.deviceFingerprint, status: usersTable.status })
    .from(usersTable)
    .where(and(
      gte(usersTable.createdAt, sixtySecondsAgo),
      ne(usersTable.id, newUserId),
      ne(usersTable.status, "banned"),
    ));

  if (burst.length >= 4) {
    const reason = "Automated bot-like registration detected: many accounts created within 60 seconds.";
    await banUser(newUserId, reason, "system");
    for (const acct of burst) {
      await banUser(acct.id, "Account created as part of a bot-like registration burst.", "system");
    }
    return { banned: true, reason, accountsAffected: burst.length + 1 };
  }
  return { banned: false };
}

export async function checkMpesaWithdrawalDuplication(userId: number): Promise<BanResult> {
  const withdrawals = await db
    .select({ phoneOrAccount: transactionsTable.phoneOrAccount })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.type, "withdrawal"),
      eq(transactionsTable.status, "completed"),
    ));

  const phones = withdrawals.map(w => w.phoneOrAccount).filter(Boolean) as string[];
  if (phones.length === 0) return { banned: false };

  for (const phone of phones) {
    const otherUsers = await db
      .select({ id: usersTable.id, status: usersTable.status })
      .from(transactionsTable)
      .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(and(
        eq(transactionsTable.phoneOrAccount, phone),
        eq(transactionsTable.type, "withdrawal"),
        ne(transactionsTable.userId, userId),
        ne(usersTable.status, "banned"),
      ));

    if (otherUsers.length > 0) {
      const reason = `Multiple accounts withdrawing to the same M-Pesa number (${phone}). Only one account is permitted per M-Pesa wallet.`;
      await banUser(userId, reason, "system-sweep");
      for (const u of otherUsers) {
        await banUser(u.id, reason, "system-sweep");
      }
      return { banned: true, reason, accountsAffected: 1 + otherUsers.length };
    }
  }
  return { banned: false };
}

export async function checkDepositWithdrawCycling(userId: number): Promise<BanResult> {
  // Look for 3+ deposit→immediate-withdrawal cycles (within 1 hour of deposit)
  const deposits = await db
    .select({ id: transactionsTable.id, amount: transactionsTable.amount, createdAt: transactionsTable.createdAt })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.type, "deposit"),
      eq(transactionsTable.status, "completed"),
    ))
    .orderBy(transactionsTable.createdAt);

  const withdrawals = await db
    .select({ id: transactionsTable.id, createdAt: transactionsTable.createdAt })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.type, "withdrawal"),
      eq(transactionsTable.status, "completed"),
    ))
    .orderBy(transactionsTable.createdAt);

  let cycles = 0;
  for (const dep of deposits) {
    const depTime = new Date(dep.createdAt).getTime();
    const hasQuickWithdrawal = withdrawals.some(w => {
      const wTime = new Date(w.createdAt).getTime();
      return wTime > depTime && wTime - depTime < 60 * 60 * 1000;
    });
    if (hasQuickWithdrawal) cycles++;
  }

  if (cycles >= 3) {
    const reason = `Deposit-withdrawal cycling detected: ${cycles} deposits were withdrawn within 1 hour. This pattern indicates earnings manipulation and is not permitted.`;
    await banUser(userId, reason, "system-sweep");
    return { banned: true, reason, accountsAffected: 1 };
  }
  return { banned: false };
}

/**
 * Periodic sweep — called from the daily cron job.
 */
export async function runFraudSweep(): Promise<{ checked: number; banned: number }> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: usersTable.id,
      phone: usersTable.phone,
      email: usersTable.email,
      registrationIp: usersTable.registrationIp,
      deviceFingerprint: usersTable.deviceFingerprint,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.status, "active"),
      sql`${usersTable.role} NOT IN ('admin', 'superadmin')`,
      lt(usersTable.createdAt, fortyEightHoursAgo),
    ));

  let banned = 0;

  for (const user of candidates) {
    // Rule 1 re-check: duplicate phone
    const phoneDups = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.phone, user.phone), ne(usersTable.id, user.id), ne(usersTable.status, "banned")));
    if (phoneDups.length > 0) {
      await banUser(user.id, "Account sharing a phone number with another account.", "system-sweep");
      for (const dup of phoneDups) {
        await banUser(dup.id, "Account sharing a phone number with another account.", "system-sweep");
      }
      banned += 1 + phoneDups.length;
      continue;
    }

    // Rule 4: Referral fraud
    const r4 = await checkReferralFraud(user.id, "system-sweep");
    if (r4.banned) { banned++; continue; }

    // Rule 5: Disposable email
    if (user.email && isDisposableEmail(user.email)) {
      await banUser(user.id, "Account registered with a disposable/temporary email address.", "system-sweep");
      banned++;
      continue;
    }

    // M-Pesa withdrawal duplication
    const rW = await checkMpesaWithdrawalDuplication(user.id);
    if (rW.banned) { banned += rW.accountsAffected ?? 1; continue; }

    // Deposit-withdraw cycling
    const rC = await checkDepositWithdrawCycling(user.id);
    if (rC.banned) { banned++; continue; }
  }

  return { checked: candidates.length, banned };
}

export function buildDeviceFingerprint(userAgent: string, acceptLanguage: string): string {
  const raw = `${userAgent}|${acceptLanguage}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}
