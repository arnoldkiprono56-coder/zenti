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

  // auto: try WhatsApp first, fall back to email if disconnected
  const status = await checkGatewayStatus();
  return { method: status.connected ? "whatsapp" : "email", settings };
}

async function saveAndSendOtp(
  phone: string,
  email: string | undefined,
  reason: string,
  userName?: string,
  ip?: string,
  _location?: string,
): Promise<{ code: string; channel: "whatsapp" | "email" }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(otpsTable).values({ phone, code, reason, expiresAt });

  const { method, settings } = await getVerificationMethod();

  if (method === "email" && email) {
    // Fire email in background
    sendEmailOtp({ email, code, reason, name: userName }, settings ? {
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort, 10) || 587,
      user: process.env["SMTP_USER"] ?? "",
      pass: process.env["SMTP_PASS"] ?? "",
      fromEmail: settings.smtpFromEmail || (process.env["SMTP_USER"] ?? ""),
      fromName: settings.smtpFromName ?? "Zenti",
    } : undefined).then((result) => {
      if (!result.delivered) {
        console.warn(`[OTP] Email delivery failed for ${email}: ${result.error ?? "unknown"}`);
      }
    }).catch((err: unknown) => {
      console.error("[OTP] Email error:", err instanceof Error ? err.message : err);
    });
    return { code, channel: "email" };
  }

  // WhatsApp (default or auto+connected)
  sendOtp({ phone, code, reason, ip }).then((result) => {
    if (!result.delivered) {
      console.warn(`[OTP] WhatsApp delivery failed for ${phone.slice(0, 4)}****: ${result.error ?? "unknown"}`);
    }
  }).catch((err: unknown) => {
    console.error("[OTP] Gateway error:", err instanceof Error ? err.message : err);
  });
  return { code, channel: "whatsapp" };
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

  const { channel } = await saveAndSendOtp(normalized, email, reason ?? "Verification", userName, ip ?? req.ip, location);

  res.json({
    ok: true,
    channel,
    message: channel === "email"
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

  const { channel } = await saveAndSendOtp(user.phone, user.email, "Funds Withdrawal", user.fullName, req.ip ?? "unknown");

  res.json({
    ok: true,
    channel,
    message: channel === "email"
      ? "Verification code sent to your email"
      : "Verification code sent to your WhatsApp",
  });
});

export default router;
