import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, referralsTable, otpsTable } from "@workspace/db";
import { activityLogsTable } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { signToken, requireAuth, AuthRequest } from "../middlewares/auth";
import { generateReferralCode } from "./referrals";
import { autoBanCheck, buildDeviceFingerprint } from "../lib/auto-ban";
import { getCountryFromRequest, countryName } from "../lib/geo";
import { isDisposableEmail } from "../lib/disposable-domains";
import { sendPasswordResetEmail, getDefaultSmtpConfig } from "../lib/email";
import { getConfig } from "../lib/config";

const router = Router();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first?.trim() ?? req.ip ?? "unknown";
  }
  return req.ip ?? "unknown";
}

router.post("/register", async (req: Request, res: Response) => {
  const { fullName, email, phone, password, refCode } = req.body;
  if (!fullName || !email || !phone || !password) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }
  if (!/^(07|01)\d{8}$/.test(phone.replace(/\s/g, ""))) {
    res.status(400).json({ error: "Phone must be a valid Kenyan number (07XX or 01XX)" });
    return;
  }

  // ── Geo-block: Kenya-only registration ────────────────────────────
  const regCountryDetected = await getCountryFromRequest(req);
  if (regCountryDetected && regCountryDetected !== "KE") {
    res.status(403).json({
      error: `Registration is only available in Kenya. Your connection appears to be from ${countryName(regCountryDetected)}. If you are in Kenya, please disable any VPN or proxy and try again.`,
      geoBlocked: true,
    });
    return;
  }

  // ── Disposable email block ─────────────────────────────────────────
  if (isDisposableEmail(email)) {
    res.status(400).json({ error: "Disposable or temporary email addresses are not allowed. Please use a real email address." });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  // Resolve referrer if ref code provided
  let referredById: number | undefined;
  if (refCode) {
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, String(refCode).toUpperCase())).limit(1);
    if (referrer) referredById = referrer.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Generate unique referral code
  let referralCode = generateReferralCode();
  let codeExists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, referralCode)).limit(1);
  while (codeExists.length > 0) {
    referralCode = generateReferralCode();
    codeExists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, referralCode)).limit(1);
  }

  // Check if user qualifies for internship (June–July 2026)
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const now = new Date();
  let isInternshipEligible = false;
  if (settings?.internshipActiveFrom && settings?.internshipActiveTo) {
    const from = new Date(settings.internshipActiveFrom);
    const to = new Date(settings.internshipActiveTo);
    isInternshipEligible = now >= from && now <= to;
  } else {
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    isInternshipEligible = year === 2026 && (month === 6 || month === 7);
  }

  // Check if OTP was genuinely verified for this phone in the last 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const normalizedPhone = phone.replace(/\s/g, "");
  const [recentVerifiedOtp] = await db
    .select({ id: otpsTable.id })
    .from(otpsTable)
    .where(and(
      eq(otpsTable.phone, normalizedPhone),
      eq(otpsTable.used, true),
      gt(otpsTable.createdAt, fiveMinutesAgo),
    ))
    .limit(1);

  // Capture device fingerprint and registration IP
  const registrationIp = getClientIp(req);
  const registrationCountry = regCountryDetected ?? "KE";
  const deviceFingerprint = buildDeviceFingerprint(
    req.headers["user-agent"] ?? "",
    req.headers["accept-language"] ?? "",
  );

  const [user] = await db.insert(usersTable).values({
    fullName,
    email,
    phone: normalizedPhone,
    passwordHash,
    isInternshipEligible,
    isVerified: !!recentVerifiedOtp,
    referralCode,
    referredById,
    registrationIp,
    registrationCountry,
    deviceFingerprint,
    balance: "100",
    lockedBalance: "100",
  }).returning();

  // Create referral record if referred
  if (referredById) {
    await db.insert(referralsTable).values({
      referrerId: referredById,
      refereeId: user.id,
    });
  }

  await db.insert(activityLogsTable).values({
    userId: user.id,
    userEmail: user.email,
    action: "user_registered",
    details: `New user registered: ${fullName}${referredById ? ` (referred by user #${referredById})` : ""} — IP: ${registrationIp}`,
    ipAddress: registrationIp,
  });

  const token = signToken(user.id);
  res.status(201).json({ user: serializeUser(user), token });

  // Fire-and-forget: auto-ban check (runs in background after response is sent)
  // User is allowed to register; ban happens silently if fraud is detected
  setTimeout(() => {
    autoBanCheck(user.id, normalizedPhone, registrationIp, deviceFingerprint, email, referredById).then((result) => {
      if (result.banned) {
        console.warn(`[AutoBan] User #${user.id} (${email}) banned: ${result.reason} — ${result.accountsAffected} account(s) affected`);
      }
    }).catch((err: unknown) => {
      console.error("[AutoBan] Check failed:", err instanceof Error ? err.message : err);
    });
  }, 2 * 60 * 1000); // 2-minute delay so user sees successful registration first

  // Fire-and-forget welcome WhatsApp message
  (async () => {
    try {
      const { sendMessage } = await import("../lib/whatsapp");
      await sendMessage(phone,
        `🎉 *Welcome to Zenti, ${fullName}!*\n\n` +
        `Your account has been created successfully.\n\n` +
        `💼 *Start earning today:*\n` +
        `• Deposit via M-Pesa\n` +
        `• Choose an investment plan\n` +
        `• Earn daily returns\n\n` +
        `📲 Log in at ${process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app"} and start building your wealth! 🚀`
      );
    } catch { /* silent */ }
  })();

  // Fire-and-forget welcome email
  (async () => {
    try {
      const { sendWelcomeEmail } = await import("../lib/email");
      await sendWelcomeEmail({ email, name: fullName });
    } catch { /* silent */ }
  })();
});

router.post("/pre-login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.status === "banned") {
    res.status(403).json({
      error: "Your account has been suspended due to a violation of our Terms of Service.",
      banned: true,
      reason: user.bannedReason ?? "Account policy violation",
      supportUrl: `${process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app"}/support`,
    });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // ── Country-change detection (non-admin only) ──────────────────────
  if (user.role === "user") {
    const loginIp = getClientIp(req);
    const loginCountry = await getCountryFromRequest(req);
    const regCountry = user.registrationCountry ?? "KE";

    if (loginCountry && loginCountry !== regCountry) {
      const reason = `Security alert: login attempt from ${countryName(loginCountry)} but account was registered in ${countryName(regCountry)}. For your security, the account has been locked. If this was you, please appeal.`;
      const now = new Date();
      await db.update(usersTable).set({ status: "banned", bannedReason: reason, bannedAt: now, updatedAt: now }).where(eq(usersTable.id, user.id));
      await db.insert(activityLogsTable).values({
        userId: user.id,
        userEmail: user.email,
        action: "account_auto_banned",
        details: `Country-change ban: registered in ${regCountry}, login from ${loginCountry} (IP: ${loginIp})`,
        ipAddress: loginIp,
      });
      (async () => {
        try {
          const { sendAccountBannedEmail } = await import("../lib/email");
          await sendAccountBannedEmail({ email: user.email, name: user.fullName }, { reason });
        } catch { /* silent */ }
      })();
      res.status(403).json({ error: "Login blocked: your account has been locked due to a foreign login attempt.", banned: true, reason, supportUrl: `${process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app"}/support` });
      return;
    }
  }

  const skipOtp = user.role === "admin" || user.role === "superadmin";
  res.json({ phone: user.phone, role: user.role, skipOtp });
});

router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.status === "banned") {
    res.status(403).json({
      error: "Your account has been suspended due to a violation of our Terms of Service.",
      banned: true,
      reason: user.bannedReason ?? "Account policy violation",
      supportUrl: `${process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app"}/support`,
    });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // ── Dormant account reactivation ───────────────────────────────────
  if (user.status === "dormant") {
    // Logging in reactivates the account — reset countdown
    await db.update(usersTable)
      .set({ status: "active", dormancyStartedAt: null, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    // Return dormant flag so frontend can show a welcome-back notice
    // (user is now active, login proceeds normally)
  }

  const loginIp = getClientIp(req);
  const loginCountry = (await getCountryFromRequest(req)) ?? user.registrationCountry ?? "KE";
  const now = new Date();

  await db.update(usersTable).set({
    lastLoginIp: loginIp,
    lastLoginAt: now,
    lastLoginCountry: loginCountry,
    dormancyStartedAt: null,
    updatedAt: now,
  }).where(eq(usersTable.id, user.id));

  await db.insert(activityLogsTable).values({
    userId: user.id,
    userEmail: user.email,
    action: "user_login",
    details: `User logged in from ${loginCountry} (IP: ${loginIp})`,
    ipAddress: loginIp,
  });
  const token = signToken(user.id);
  const wasdormant = user.status === "dormant";
  res.json({ user: serializeUser(user), token, ...(wasdormant ? { reactivated: true } : {}) });
});

router.post("/logout", async (req: AuthRequest, res: Response) => {
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.status === "banned") {
    res.status(403).json({
      error: "Your account has been suspended.",
      banned: true,
      reason: user.bannedReason ?? "Account policy violation",
      supportUrl: `${process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app"}/support`,
    });
    return;
  }
  res.json(serializeUser(user));
});

// Verify account: called after OTP is confirmed to mark user as verified
router.post("/verify-account", async (req: Request, res: Response) => {
  const { phone, code } = req.body as { phone: string; code: string };
  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code are required" });
    return;
  }

  const normalizedPhone = phone.replace(/[\s\-]/g, "").replace(/^\+254/, "0").replace(/^254/, "0");
  const now = new Date();

  // Verify OTP
  const [otp] = await db
    .select()
    .from(otpsTable)
    .where(and(
      eq(otpsTable.phone, normalizedPhone),
      eq(otpsTable.code, code),
      eq(otpsTable.used, false),
      gt(otpsTable.expiresAt, now),
    ))
    .orderBy(otpsTable.createdAt)
    .limit(1);

  if (!otp) {
    res.status(400).json({ error: "Invalid or expired verification code. Please request a new one." });
    return;
  }

  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otp.id));

  // Find user by phone and mark verified
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "No account found for this phone number" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();

  await db.insert(activityLogsTable).values({
    userId: updated.id,
    userEmail: updated.email,
    action: "account_verified",
    details: "Account verified via OTP",
    ipAddress: req.ip || "unknown",
  });

  const token = signToken(updated.id);
  res.json({ user: serializeUser(updated), token, verified: true });
});

// Forgot password: verify OTP then set new password
/* ─── Forgot Password (send secure email link) ───────────────────────────── */
router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  if (!email) {
    res.status(400).json({ error: "Email address is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);

  // Always return success to prevent email enumeration
  if (!user) {
    res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(usersTable).set({ resetToken: token, resetTokenExpiry: expiry, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  let frontendUrl = process.env.APP_URL || process.env.FRONTEND_URL || "https://zenti-investment-kenya.vercel.app";
  try { frontendUrl = await getConfig("APP_URL") || frontendUrl; } catch {}
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

  const settings = await db.select().from(platformSettingsTable).limit(1).then(r => r[0] ?? null);
  const smtpCfg = getDefaultSmtpConfig(settings);
  await sendPasswordResetEmail({ email: user.email, name: user.fullName }, { resetUrl }, smtpCfg);

  await db.insert(activityLogsTable).values({
    userId: user.id,
    userEmail: user.email,
    action: "password_reset_requested",
    details: "Password reset link sent to email",
    ipAddress: req.ip || "unknown",
  });

  res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
});

/* ─── Reset Password (via secure token from email link) ──────────────────── */
router.post("/reset-password", async (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  if (!token || !newPassword) {
    res.status(400).json({ error: "Token and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const now = new Date();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(
      eq(usersTable.resetToken, token),
      gt(usersTable.resetTokenExpiry!, now),
    ))
    .limit(1);

  if (!user) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable)
    .set({ passwordHash, resetToken: null, resetTokenExpiry: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  await db.insert(activityLogsTable).values({
    userId: user.id,
    userEmail: user.email,
    action: "password_reset",
    details: "Password reset via email link",
    ipAddress: req.ip || "unknown",
  });

  res.json({ ok: true, message: "Password updated successfully. You can now log in." });
});

export function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    balance: parseFloat(user.balance ?? "0"),
    lockedBalance: parseFloat(user.lockedBalance ?? "0"),
    totalEarned: parseFloat(user.totalEarned ?? "0"),
    createdAt: user.createdAt,
    isVerified: user.isVerified,
    isInternshipEligible: user.isInternshipEligible,
    internshipActivated: user.internshipActivated,
    referralCode: user.referralCode,
    referralStatus: user.referralStatus,
  };
}

export default router;
