import { db } from "@workspace/db";
import { usersTable, activityLogsTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq, and, ne, gte, sql } from "drizzle-orm";

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
): Promise<BanResult> {
  const now = new Date();
  let bannedCount = 0;

  /* ── Rule 1: Duplicate phone number ──────────────────────────────── */
  const phoneDups = await db
    .select({ id: usersTable.id, createdAt: usersTable.createdAt, status: usersTable.status })
    .from(usersTable)
    .where(and(eq(usersTable.phone, phone), ne(usersTable.id, newUserId)));

  if (phoneDups.length > 0) {
    const reason = "Multiple accounts registered with the same phone number. Only one account is allowed per phone number.";
    await banUser(newUserId, reason, ip);
    bannedCount++;

    // Ban ALL existing accounts with the same phone — age doesn't matter
    for (const dup of phoneDups.filter(d => d.status !== "banned")) {
      await banUser(dup.id, "Account associated with a phone number used to create a duplicate account. Only one account per phone number is permitted.", ip);
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
      .where(
        and(
          eq(usersTable.registrationIp, ip),
          gte(usersTable.createdAt, oneHourAgo),
          ne(usersTable.id, newUserId),
          ne(usersTable.status, "banned"),
        )
      );

    if (ipAccounts.length >= 2) {
      const reason = `Suspicious activity detected: multiple accounts registered from the same network location within a short period. IP: ${ip}`;
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
      .where(
        and(
          eq(usersTable.deviceFingerprint, fingerprint),
          gte(usersTable.createdAt, twentyFourHoursAgo),
          ne(usersTable.id, newUserId),
          ne(usersTable.status, "banned"),
        )
      );

    if (fpAccounts.length >= 2) {
      const reason = "Multiple accounts detected from the same device within 24 hours. Account creation abuse is not permitted.";
      await banUser(newUserId, reason, ip);
      bannedCount++;

      for (const acct of fpAccounts) {
        await banUser(acct.id, "Account created as part of a device-based multi-account pattern.", ip);
        bannedCount++;
      }

      return { banned: true, reason, accountsAffected: bannedCount };
    }
  }

  /* ── Rule 4: Referral fraud — 5+ referrals with no real deposit ─────── */
  // Give user 48 hours after registration before this fires, so genuine
  // users have time to deposit.
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const [newUser] = await db
    .select({ createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, newUserId))
    .limit(1);

  if (newUser && new Date(newUser.createdAt) < fortyEightHoursAgo) {
    const result = await checkReferralFraud(newUserId, ip);
    if (result.banned) return result;
  }

  return { banned: false };
}

/**
 * Standalone referral-fraud check — can be called from the cron sweep too.
 * Bans a user if they have 5+ referrals but zero completed real M-Pesa deposits.
 */
export async function checkReferralFraud(userId: number, ip = "system"): Promise<BanResult> {
  const referralCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, userId));

  const total = referralCount[0]?.count ?? 0;
  if (total < 5) return { banned: false };

  // Check for at least one completed real M-Pesa deposit
  const [realDeposit] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.type, "deposit"),
        eq(transactionsTable.status, "completed"),
        eq(transactionsTable.method, "mpesa"),
      )
    )
    .limit(1);

  if (realDeposit) return { banned: false };

  const reason = `Referral abuse detected: account recruited ${total} user(s) without making any real M-Pesa deposit. Referral rewards require genuine platform participation.`;
  await banUser(userId, reason, ip);
  return { banned: true, reason, accountsAffected: 1 };
}

/**
 * Periodic sweep — called from the daily cron job.
 * Re-checks all active non-admin accounts for referral fraud.
 */
export async function runFraudSweep(): Promise<{ checked: number; banned: number }> {
  const candidates = await db
    .select({ id: usersTable.id, phone: usersTable.phone, registrationIp: usersTable.registrationIp, deviceFingerprint: usersTable.deviceFingerprint })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.status, "active"),
        sql`${usersTable.role} NOT IN ('admin', 'superadmin')`,
        // Only check accounts older than 48 hours
        sql`${usersTable.createdAt} < now() - interval '48 hours'`,
      )
    );

  let banned = 0;
  for (const user of candidates) {
    // Rule 1 re-check: duplicate phone
    const phoneDups = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.phone, user.phone), ne(usersTable.id, user.id), ne(usersTable.status, "banned")));
    if (phoneDups.length > 0) {
      await banUser(user.id, "Account sharing a phone number with another account. Only one account per phone number is allowed.", "system-sweep");
      for (const dup of phoneDups) {
        await banUser(dup.id, "Account sharing a phone number with another account.", "system-sweep");
      }
      banned += 1 + phoneDups.length;
      continue;
    }

    // Rule 4 re-check: referral fraud
    const result = await checkReferralFraud(user.id, "system-sweep");
    if (result.banned) banned++;
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
