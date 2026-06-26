import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { otpsTable, usersTable, platformSettingsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { sendOtp, checkGatewayStatus } from "../lib/whatsapp";
import { sendEmailOtp } from "../lib/email";
import { requireAuth, AuthRequest } from "../middlewares/auth";

const router = Router();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-]/g, "");
  if (cleaned.startsWith("+254")) return "0" + cleaned.slice(4);
  if (cleaned.startsWith("254"))  return "0" + cleaned.slice(3);
  return cleaned;
}

async function getVerificationMethod(): Promise<{
  method: "whatsapp" | "email";
  settings: Awaited<ReturnType<typeof db.select>> extends Array<infer T> ? T : never;
}> {
  const [settings] = await db.select().from(platformSettingsTable).limit(1) as any[];
  const configured = settings?.verificationMethod ?? "auto";

  if (configured === "whatsapp") {
    return { method: "whatsapp", settings };
  }
  if (configured === "email") {
    return { method: "email", settings };
  }

  // auto: if BOT_BASE_URL is not configured, go straight to email (never WhatsApp)
  const botBaseUrl = process.env["BOT_BASE_URL"];
  if (!botBaseUrl || botBaseUrl.trim() === "") {
    return { method: "email", settings };
  }

  // auto: try WhatsApp gateway, fall back to email if not reachable
  try {
    const status = await checkGatewayStatus();
    return { method: status.connected ? "whatsapp" : "email", settings };
  } catch {
    return { method: "email", settings };
  }
}

function buildSmtpConfig(settings: any) {
  const user = process.env["SMTP_USER"] ?? "";
  const pass = (process.env["SMTP_PASS"] ?? "").replace(/\s/g, "");
  return {
    host: settings?.smtpHost ?? "smtp.gmail.com",
    port: parseInt(settings?.smtpPort ?? "587", 10) || 587,
    user,
    pass,
    fromEmail: settings?.smtpFromEmail || user,
    fromName: settings?.smtpFromName ?? "Zenti",
  };
}

async function saveAndSendOtp(
  phone: string,
  email: string | undefined,
  reason: string,
  userName?: string,
  ip?: string,
  _location?: string,
): Promise<{ code: string; channel: "whatsapp" | "email"; delivered: boolean; error?: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(otpsTable).values({ phone, code, reason, expiresAt });

  const isPasswordReset = /password|reset/i.test(reason);
  const { method, settings } = isPasswordReset
    ? { method: "email" as const, settings: (await db.select().from(platformSettingsTable).limit(1) as any[])[0] }
    : await getVerificationMethod();

  if (method === "email") {
    let emailToUse = email;

    // For password reset, look up the user's email from their phone if it wasn't supplied
    if (!emailToUse && isPasswordReset) {
      const [user] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);
      emailToUse = user?.email;
    }

    if (!emailToUse) {
      console.warn(`[OTP] Email method selected but no email found for phone ${phone.slice(0, 4)}****`);
      // Fall through to WhatsApp if no email can be determined
    } else {
      const smtpCfg = buildSmtpConfig(settings);
      const result = await sendEmailOtp({ email: emailToUse, code, reason, name: userName }, smtpCfg);
      if (!result.delivered) {
        console.error(`[OTP] Email delivery failed for ${emailToUse}: ${result.error ?? "unknown"}`);
        return { code, channel: "email", delivered: false, error: result.error };
      }
      return { code, channel: "email", delivered: true };
    }
  }

  // WhatsApp
  const result = await sendOtp({ phone, code, reason, ip });
  if (!result.delivered) {
    console.warn(`[OTP] WhatsApp delivery failed for ${phone.slice(0, 4)}****: ${result.error ?? "unknown"}`);
    // If WhatsApp fails and we have an email, try email as fallback
    if (email) {
      const [settings2] = await db.select().from(platformSettingsTable).limit(1) as any[];
      const smtpCfg = buildSmtpConfig(settings2);
      const emailResult = await sendEmailOtp({ email, code, reason, name: userName }, smtpCfg);
      if (emailResult.delivered) {
        return { code, channel: "email", delivered: true };
      }
      return { code, channel: "email", delivered: false, error: emailResult.error };
    }
    return { code, channel: "whatsapp", delivered: false, error: result.error };
  }
  return { code, channel: "whatsapp", delivered: true };
}

router.post("/send", async (req: Request, res: Response) => {
  const { phone, email, reason, ip, location, userName } = req.body as {
    phone: string;
    email?: string;
    reason?: string;
    ip?: string;
    location?: string;
    userName?: string;
  };

  if (!phone) {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }

  const normalized = normalizePhone(phone);
  if (!/^(07|01)\d{8}$/.test(normalized)) {
    res.status(400).json({ error: "Invalid Kenyan phone number (must start with 07 or 01)" });
    return;
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recent = await db
    .select({ id: otpsTable.id })
    .from(otpsTable)
    .where(and(eq(otpsTable.phone, normalized), gt(otpsTable.createdAt, fiveMinutesAgo)));

  if (recent.length >= 3) {
    res.status(429).json({ error: "Too many OTP requests. Please wait a few minutes and try again." });
    return;
  }

  const result = await saveAndSendOtp(normalized, email, reason ?? "Verification", userName, ip ?? req.ip?.toString(), location);

  if (!result.delivered) {
    res.status(503).json({
      error: result.channel === "email"
        ? `We couldn't deliver the verification code to your email (${email ?? "unknown"}). Please check your email address or contact support at https://zenti-investment-kenya.vercel.app/support.`
        : "We couldn't deliver the verification code via WhatsApp. Please try again or contact support.",
      detail: result.error,
    });
    return;
  }

  res.json({
    ok: true,
    channel: result.channel,
    message: result.channel === "email"
      ? "Verification code sent to your email"
      : "Verification code sent via WhatsApp",
  });
});

router.post("/verify", async (req: Request, res: Response) => {
  const { phone, code } = req.body as { phone: string; code: string };

  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code are required" });
    return;
  }

  const normalized = normalizePhone(phone);
  const now = new Date();

  const [otp] = await db
    .select()
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.phone, normalized),
        eq(otpsTable.code, code),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, now),
      ),
    )
    .orderBy(otpsTable.createdAt)
    .limit(1);

  if (!otp) {
    res.status(400).json({ error: "Invalid or expired OTP. Please request a new code." });
    return;
  }

  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otp.id));

  res.json({ ok: true, verified: true });
});

// Authenticated: send withdrawal OTP to user's registered phone
router.post("/send-withdrawal", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db
    .select({ phone: usersTable.phone, fullName: usersTable.fullName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recent = await db
    .select({ id: otpsTable.id })
    .from(otpsTable)
    .where(and(eq(otpsTable.phone, user.phone), gt(otpsTable.createdAt, fiveMinutesAgo)));

  if (recent.length >= 3) {
    res.status(429).json({ error: "Too many OTP requests. Please wait a few minutes and try again." });
    return;
  }

  const result = await saveAndSendOtp(user.phone, user.email, "Funds Withdrawal", user.fullName, req.ip?.toString() ?? "unknown");

  if (!result.delivered) {
    res.status(503).json({
      error: "We couldn't deliver the verification code. Please try again or contact https://zenti-investment-kenya.vercel.app/support.",
      detail: result.error,
    });
    return;
  }

  res.json({
    ok: true,
    channel: result.channel,
    message: result.channel === "email"
      ? "Verification code sent to your email"
      : "Verification code sent to your WhatsApp",
  });
});

export default router;
