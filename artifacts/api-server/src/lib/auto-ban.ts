import { db } from "@workspace/db";
import { usersTable, activityLogsTable } from "@workspace/db";
import { eq, and, ne, gte, not, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

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

    for (const dup of phoneDups.filter(d => d.status !== "banned")) {
      const dupAgeMins = (now.getTime() - new Date(dup.createdAt).getTime()) / 60000;
      if (dupAgeMins < 60) {
        await banUser(dup.id, "Account associated with a phone number used to create duplicate accounts.", ip);
        bannedCount++;
      }
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

  return { banned: false };
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
