import nodemailer from "nodemailer";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailResult {
  ok: boolean;
  delivered: boolean;
  error?: string;
}

export interface EmailOtpPayload {
  email: string;
  code: string;
  reason?: string;
  name?: string;
}

export interface EmailNotificationPayload {
  email: string;
  name?: string;
  subject: string;
  heading: string;
  body: string;
  icon?: string;
}

/* ─── Config helper ──────────────────────────────────────────────────────── */

export function getDefaultSmtpConfig(settings?: {
  smtpHost?: string | null;
  smtpPort?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  supportEmail?: string | null;
} | null): SmtpConfig {
  const user = process.env["SMTP_USER"] ?? "";
  const pass = process.env["SMTP_PASS"] ?? "";
  return {
    host: settings?.smtpHost ?? "smtp.gmail.com",
    port: parseInt(settings?.smtpPort ?? "587", 10) || 587,
    user,
    pass,
    fromEmail: settings?.smtpFromEmail || user,
    fromName: settings?.smtpFromName ?? "Zenti",
  };
}

/* ─── Internal helpers ───────────────────────────────────────────────────── */

function fmt(amount: number): string {
  return `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildTransporter(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

async function send(cfg: SmtpConfig, to: string, subject: string, html: string, text: string): Promise<EmailResult> {
  if (!cfg.user || !cfg.pass) return { ok: false, delivered: false, error: "SMTP credentials not configured" };
  if (!to) return { ok: false, delivered: false, error: "Recipient email is required" };
  try {
    await buildTransporter(cfg).sendMail({ from: `"${cfg.fromName}" <${cfg.fromEmail}>`, to, subject, html, text });
    return { ok: true, delivered: true };
  } catch (err) {
    return { ok: false, delivered: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

/* ─── HTML Layout ────────────────────────────────────────────────────────── */

function layout(cfg: SmtpConfig, body: string): string {
  // Fix: use cfg.fromEmail and cfg.fromName from settings instead of hardcoded values
  const supportEmail = cfg.fromEmail || "support@zenti.run.place";
  const fromName = cfg.fromName || "Zenti";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${fromName}</title></head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:36px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);max-width:560px;">
        <tr>
          <td style="background:linear-gradient(135deg,#14532d 0%,#16a34a 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">${fromName}</h1>
            <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">Kenya's Smart Investment Platform</p>
          </td>
        </tr>
        <tr><td style="padding:36px 40px;">${body}</td></tr>
        <tr>
          <td style="background:#f7fdf9;padding:16px 40px;text-align:center;border-top:1px solid #d1fae5;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Questions? <a href="mailto:${supportEmail}" style="color:#16a34a;text-decoration:none;">${supportEmail}</a></p>
            <p style="margin:0;color:#9ca3af;font-size:11px;">&copy; ${new Date().getFullYear()} ${fromName}. All rights reserved. Nairobi, Kenya.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function row(label: string, value: string, highlight = false): string {
  const vs = highlight
    ? "padding:10px 0;border-bottom:1px solid #d1fae5;font-weight:700;color:#14532d;text-align:right;font-size:14px;"
    : "padding:10px 0;border-bottom:1px solid #f0fdf4;text-align:right;color:#374151;font-size:14px;";
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #f0fdf4;color:#6b7280;font-size:14px;">${label}</td><td style="${vs}">${value}</td></tr>`;
}

function table(rows: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;">${rows}</table>`;
}

function cta(text: string, url = "https://zenti.run.place"): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr><td align="center"><a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#14532d,#16a34a);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;">${text}</a></td></tr></table>`;
}

function hero(icon: string, text: string, bg = "#f0fdf4", color = "#14532d"): string {
  return `<div style="background:${bg};border-radius:10px;padding:18px;text-align:center;margin:20px 0;"><div style="font-size:36px;margin-bottom:8px;">${icon}</div><div style="font-size:16px;font-weight:700;color:${color};">${text}</div></div>`;
}

function hi(name?: string): string {
  return `<p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi <strong>${name ?? "there"}</strong>,</p>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">${text}</p>`;
}

function hr(): string {
  return `<hr style="border:none;border-top:1px solid #d1fae5;margin:24px 0;"/>`;
}

function note(text: string): string {
  return `<p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.6;">${text}</p>`;
}

function tip(text: string): string {
  return `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:16px 0;"><p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;">💡 ${text}</p></div>`;
}

function alert(text: string, bg = "#fef2f2", border = "#fecaca", color = "#7f1d1d"): string {
  return `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:14px 18px;margin:16px 0;"><p style="margin:0;color:${color};font-size:14px;line-height:1.6;">${text}</p></div>`;
}

function warningBox(text: string): string {
  return `<div style="background:#fff7ed;border:2px solid #fb923c;border-radius:12px;padding:18px 20px;margin:20px 0;">
    <div style="font-size:22px;text-align:center;margin-bottom:8px;">⚠️</div>
    <p style="margin:0;color:#7c2d12;font-size:14px;font-weight:700;text-align:center;line-height:1.7;">${text}</p>
  </div>`;
}

/* ─── OTP Email ──────────────────────────────────────────────────────────── */

export async function sendEmailOtp(payload: EmailOtpPayload, smtpConfig?: SmtpConfig): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const reason = payload.reason ?? "Verification";
  const body = `
    ${hi(payload.name)}
    ${para(`Your verification code for <strong>${reason}</strong> is:`)}
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #16a34a;border-radius:14px;padding:20px 52px;">
        <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#14532d;font-family:'Courier New',monospace;">${payload.code}</span>
      </div>
    </td></tr></table>
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-align:center;">Expires in <strong>5 minutes</strong>. Never share it with anyone.</p>
    ${hr()}${note("If you didn't request this code, you can safely ignore this email.")}`;
  return send(cfg, payload.email, `${payload.code} — Your ${cfg.fromName} Verification Code`, layout(cfg, body),
    `Your ${cfg.fromName} verification code for ${reason} is: ${payload.code}\n\nExpires in 5 minutes. Do not share.`);
}

/* ─── Generic notification ───────────────────────────────────────────────── */

export async function sendEmailNotification(payload: EmailNotificationPayload, smtpConfig?: SmtpConfig): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const body = `
    <div style="font-size:36px;text-align:center;margin-bottom:12px;">${payload.icon ?? "📬"}</div>
    <h2 style="margin:0 0 20px;color:#111827;font-size:19px;text-align:center;">${payload.heading}</h2>
    <div style="color:#374151;font-size:15px;line-height:1.7;">${payload.body}</div>`;
  return send(cfg, payload.email, payload.subject, layout(cfg, body), payload.body.replace(/<[^>]+>/g, ""));
}

/* ─── SMTP Test ──────────────────────────────────────────────────────────── */

export async function testSmtpConnection(config: { host: string; port: number; user: string; pass: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    await nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465, auth: { user: config.user, pass: config.pass } }).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

/* ─── Welcome ────────────────────────────────────────────────────────────── */

export async function sendWelcomeEmail(user: { email: string; name: string }, smtpConfig?: SmtpConfig): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const body = `
    ${hi(user.name)}
    ${hero("🎉", `Welcome to ${cfg.fromName}!`)}
    ${para("Your account has been created successfully. You're now part of Kenya's fastest-growing investment community.")}
    <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Here's how to start earning:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="padding:8px 0;"><span style="display:inline-block;background:#16a34a;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;vertical-align:middle;">1</span><span style="color:#374151;font-size:14px;vertical-align:middle;">Activate your free <strong>Internship Package</strong> — earn KES 200 in 2 days, no deposit needed.</span></td></tr>
      <tr><td style="padding:8px 0;"><span style="display:inline-block;background:#16a34a;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;vertical-align:middle;">2</span><span style="color:#374151;font-size:14px;vertical-align:middle;">Deposit via <strong>M-Pesa</strong> and choose an investment plan.</span></td></tr>
      <tr><td style="padding:8px 0;"><span style="display:inline-block;background:#16a34a;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;vertical-align:middle;">3</span><span style="color:#374151;font-size:14px;vertical-align:middle;"><strong>Claim</strong> your daily earnings each day before 11:59 PM or they expire!</span></td></tr>
    </table>
    ${cta("🚀 Start Earning Now")}${hr()}${note("You received this because you created a Zenti account.")}`;
  return send(cfg, user.email, `🎉 Welcome to ${cfg.fromName} — Start Earning Today!`, layout(cfg, body),
    `Welcome to ${cfg.fromName}, ${user.name}! Activate your free Internship Package and start earning.`);
}

/* ─── Deposit Confirmed ──────────────────────────────────────────────────── */

export async function sendDepositConfirmedEmail(
  user: { email: string; name: string },
  data: { amount: number; newBalance: number; reference?: string | null; method?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const rows = [
    row("Amount Deposited", fmt(data.amount), true),
    row("Method", data.method ?? "M-Pesa"),
    ...(data.reference ? [row("Reference", data.reference)] : []),
    row("New Wallet Balance", fmt(data.newBalance), true),
    row("Time", time),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("💰", `${fmt(data.amount)} Deposit Received`)}
    ${para("Your M-Pesa deposit has been received and credited to your Zenti wallet instantly.")}
    ${table(rows)}
    ${para("Ready to invest? Browse our plans and start earning daily returns.")}
    ${cta("💼 Browse Investment Plans")}${hr()}${note("If you did not make this deposit, contact support immediately.")}`;
  return send(cfg, user.email, `💰 Deposit Confirmed — ${fmt(data.amount)} credited to your wallet`, layout(cfg, body),
    `Your deposit of ${fmt(data.amount)} is confirmed. New balance: ${fmt(data.newBalance)}.`);
}

/* ─── Package Activated (Investment Started) — with full claiming warning ── */

export async function sendPackageActivatedEmail(
  user: { email: string; name: string },
  data: {
    planName: string;
    isInternship: boolean;
    amountInvested: number;
    dailyEarning: number;
    expectedTotal: number;
    completesAt: Date;
    durationDays: number;
  },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const lastDayDate = fmtDate(data.completesAt);
  const rows = [
    row("Plan", `<strong>${data.planName}</strong>`),
    ...(data.isInternship ? [row("Cost", "FREE — No Deposit Required", true)] : [row("Amount Invested", fmt(data.amountInvested), true)]),
    row("Daily Earning", fmt(data.dailyEarning)),
    row("Duration", `${data.durationDays} day${data.durationDays !== 1 ? "s" : ""}`),
    row("Total Expected", fmt(data.expectedTotal), true),
    row("Last Day / Withdrawal Date", `<strong style="color:#14532d;">${lastDayDate}</strong>`, true),
  ].join("");

  const claimingRules = `
    <div style="background:#fff7ed;border:2px solid #fb923c;border-radius:14px;padding:22px 24px;margin:24px 0;">
      <h3 style="margin:0 0 14px;color:#9a3412;font-size:16px;font-weight:800;text-align:center;">⚠️ IMPORTANT — READ CAREFULLY</h3>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #fed7aa;">
            <span style="font-size:18px;vertical-align:middle;margin-right:10px;">📅</span>
            <span style="color:#7c2d12;font-size:14px;font-weight:700;vertical-align:middle;">Daily Claiming Required</span>
            <p style="margin:4px 0 0 28px;color:#9a3412;font-size:13px;line-height:1.6;">You <strong>MUST</strong> log in and click "Claim Earnings" on your dashboard <strong>every single day</strong> before <strong>11:59 PM Kenya time</strong>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #fed7aa;">
            <span style="font-size:18px;vertical-align:middle;margin-right:10px;">💸</span>
            <span style="color:#7c2d12;font-size:14px;font-weight:700;vertical-align:middle;">Unclaimed = Lost Forever</span>
            <p style="margin:4px 0 0 28px;color:#9a3412;font-size:13px;line-height:1.6;">Any earnings not claimed by 11:59 PM are <strong>permanently deleted</strong>. They cannot be recovered.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;">
            <span style="font-size:18px;vertical-align:middle;margin-right:10px;">🔒</span>
            <span style="color:#7c2d12;font-size:14px;font-weight:700;vertical-align:middle;">Withdrawal Only on Last Day</span>
            <p style="margin:4px 0 0 28px;color:#9a3412;font-size:13px;line-height:1.6;">You can only withdraw your earnings on the <strong>last day</strong> of your active investment: <strong>${lastDayDate}</strong>. Withdrawals before this date are not permitted.</p>
          </td>
        </tr>
      </table>
    </div>`;

  const steps = `
    <p style="margin:16px 0 8px;color:#111827;font-size:14px;font-weight:700;">📋 How to claim your daily earnings:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="padding:6px 0;"><span style="display:inline-block;background:#16a34a;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:8px;vertical-align:middle;">1</span><span style="color:#374151;font-size:14px;vertical-align:middle;">Log in to your Zenti account</span></td></tr>
      <tr><td style="padding:6px 0;"><span style="display:inline-block;background:#16a34a;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:8px;vertical-align:middle;">2</span><span style="color:#374151;font-size:14px;vertical-align:middle;">Go to your Dashboard</span></td></tr>
      <tr><td style="padding:6px 0;"><span style="display:inline-block;background:#16a34a;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:8px;vertical-align:middle;">3</span><span style="color:#374151;font-size:14px;vertical-align:middle;">Click the green <strong>"Claim Earnings"</strong> button</span></td></tr>
      <tr><td style="padding:6px 0;"><span style="display:inline-block;background:#16a34a;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:8px;vertical-align:middle;">4</span><span style="color:#374151;font-size:14px;vertical-align:middle;">Repeat <strong>every day</strong> before 11:59 PM</span></td></tr>
    </table>`;

  const body = `
    ${hi(user.name)}
    ${hero("🚀", `${data.planName} — Activated!`)}
    ${para(`Your investment plan is now live and earning daily. Here are your plan details:`)}
    ${table(rows)}
    ${claimingRules}
    ${steps}
    ${cta("✅ Claim My Earnings Now")}
    ${hr()}${note("You received this because you activated an investment plan on Zenti.")}`;

  const subject = data.isInternship
    ? `🎓 Internship Package Active — Claim Daily by 11:59 PM!`
    : `🚀 ${data.planName} Active — CLAIM YOUR EARNINGS DAILY by 11:59 PM!`;

  return send(cfg, user.email, subject, layout(cfg, body),
    `Your ${data.planName} is active!\n\nIMPORTANT: You must claim your daily earnings by 11:59 PM every day or they are lost.\nWithdrawals only on the last day: ${lastDayDate}.\n\nLog in and claim your earnings now!`);
}

/* ─── Internship Activated (kept for backward compat) ────────────────────── */

export async function sendInternshipActivatedEmail(
  user: { email: string; name: string },
  data: { dailyEarning: number; totalEarning: number; completesAt: Date },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  return sendPackageActivatedEmail(user, {
    planName: "2-Day Internship Package",
    isInternship: true,
    amountInvested: 0,
    dailyEarning: data.dailyEarning,
    expectedTotal: data.totalEarning,
    completesAt: data.completesAt,
    durationDays: 2,
  }, smtpConfig);
}

/* ─── Investment Started (kept for backward compat) ──────────────────────── */

export async function sendInvestmentStartedEmail(
  user: { email: string; name: string },
  data: { planName: string; amountInvested: number; dailyEarning: number; expectedTotal: number; completesAt: Date; durationDays?: number },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  return sendPackageActivatedEmail(user, {
    planName: data.planName,
    isInternship: false,
    amountInvested: data.amountInvested,
    dailyEarning: data.dailyEarning,
    expectedTotal: data.expectedTotal,
    completesAt: data.completesAt,
    durationDays: data.durationDays ?? 0,
  }, smtpConfig);
}

/* ─── Daily Claim Reminder ───────────────────────────────────────────────── */

export async function sendClaimReminderEmail(
  user: { email: string; name: string },
  data: { earned: number; expiresAt: Date },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const expiryTime = data.expiresAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" });
  const body = `
    ${hi(user.name)}
    ${hero("💸", `+${fmt(data.earned)} Ready to Claim!`, "#f0fdf4", "#14532d")}
    ${warningBox(`Your daily earning of <strong>${fmt(data.earned)}</strong> expires at <strong>${expiryTime} (Kenya Time)</strong> tonight.<br/><br/>If you do NOT claim it, the money is <strong>PERMANENTLY LOST</strong>.`)}
    ${para("Click the button below to log in and claim your earnings right now. It takes just a few seconds!")}
    ${cta("🟢 CLAIM MY EARNINGS NOW")}
    <div style="margin:16px 0;text-align:center;">
      <p style="margin:0;color:#6b7280;font-size:13px;">⏰ Deadline: <strong style="color:#dc2626;">${expiryTime} Kenya Time tonight</strong></p>
    </div>
    ${hr()}${note("You receive this reminder because you have an active investment on Zenti.")}`;
  return send(cfg, user.email, `⚠️ CLAIM ${fmt(data.earned)} NOW — Expires Tonight at 11:59 PM!`, layout(cfg, body),
    `Your daily earning of ${fmt(data.earned)} expires at 11:59 PM tonight. Log in and claim it now or it will be permanently lost.`);
}

/* ─── Daily Earning Credited ─────────────────────────────────────────────── */

export async function sendDailyEarningEmail(
  user: { email: string; name: string },
  data: { earned: number; newBalance: number; isInternship?: boolean },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const label = data.isInternship ? "Internship Earning" : "Daily Return";
  const rows = [
    row(`${label} Credited`, fmt(data.earned), true),
    row("New Wallet Balance", fmt(data.newBalance), true),
    row("Credited At", time),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("💸", `+${fmt(data.earned)} Earned Today!`)}
    ${para(`Your ${label.toLowerCase()} has been credited to your wallet.`)}
    ${table(rows)}
    ${para("Keep your investment active and watch your earnings grow day after day. 🚀")}
    ${cta("🏦 View My Wallet")}${hr()}${note("You receive this daily update while your investment is active.")}`;
  return send(cfg, user.email, `💸 ${label}: ${fmt(data.earned)} credited to your wallet`, layout(cfg, body),
    `${label}: ${fmt(data.earned)} credited. New balance: ${fmt(data.newBalance)}.`);
}

/* ─── Investment Completed ───────────────────────────────────────────────── */

export async function sendInvestmentCompletedEmail(
  user: { email: string; name: string },
  data: { totalEarned: number; newBalance: number; isInternship?: boolean; planName?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const label = data.isInternship ? "Internship Package" : `${data.planName ?? "Investment"} Plan`;
  const rows = [
    row("Plan Completed", `<strong>${label}</strong>`),
    row("Total Earned", fmt(data.totalEarned), true),
    row("Current Balance", fmt(data.newBalance), true),
    row("Status", '<span style="color:#16a34a;font-weight:700;">✅ Completed</span>'),
  ].join("");
  const reinvestTip = data.isInternship
    ? tip(`<strong>Great start!</strong> Your balance is ready. Invest it in a premium plan and multiply your earnings every single day!`)
    : para("Your wallet is loaded and ready. Reinvest now to keep your money working for you!");
  const withdrawNote = data.isInternship
    ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0;"><p style="margin:0;color:#713f12;font-size:14px;font-weight:700;">🔒 Your KES 200 is Locked</p><p style="margin:6px 0 0;color:#92400e;font-size:13px;line-height:1.6;">Internship earnings are locked until you purchase a Premium Plan with a real M-Pesa deposit. Once your paid plan matures, your full balance (including this KES 200) will be available for withdrawal.</p></div>`
    : `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 18px;margin:16px 0;"><p style="margin:0;color:#14532d;font-size:14px;font-weight:700;">💰 Today is your withdrawal day!</p><p style="margin:6px 0 0;color:#166534;font-size:13px;line-height:1.6;">Since your plan has completed, today is the last day. You can now withdraw your earnings to M-Pesa, Airtel Money, or Bank.</p></div>`;
  const body = `
    ${hi(user.name)}
    ${hero("🏆", data.isInternship ? "Internship Package Completed!" : "Congratulations — Investment Matured!")}
    ${para(`Your <strong>${label}</strong> has fully matured! All earnings have been credited to your wallet.`)}
    ${table(rows)}
    ${withdrawNote}
    ${reinvestTip}
    ${cta(data.isInternship ? "🚀 Start a Premium Plan" : "💼 Reinvest Now")}${hr()}${note(data.isInternship ? "Purchase a Premium Plan to unlock your KES 200 and start withdrawing." : "Your earnings are in your wallet, available for withdrawal or reinvestment.")}`;
  return send(cfg, user.email, `🏆 ${label} Completed — ${fmt(data.totalEarned)} Earned!`, layout(cfg, body),
    data.isInternship
      ? `Your ${label} has matured! Total earned: ${fmt(data.totalEarned)}. Your KES 200 is locked — buy a Premium Plan to unlock it.`
      : `Your ${label} has matured! Total earned: ${fmt(data.totalEarned)}. New balance: ${fmt(data.newBalance)}. You can now withdraw your earnings.`);
}

/* ─── Withdrawal Requested ───────────────────────────────────────────────── */

export async function sendWithdrawalRequestedEmail(
  user: { email: string; name: string },
  data: { amount: number; fee: number; netAmount: number; method: string; account: string; feePercent: number },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const methodLabel = data.method.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const rows = [
    row("Amount Requested", fmt(data.amount), true),
    row(`Processing Fee (${data.feePercent}%)`, fmt(data.fee)),
    row("You Will Receive", fmt(data.netAmount), true),
    row("Method", methodLabel),
    row("Account / Phone", data.account),
    row("Submitted At", time),
    row("Status", '<span style="color:#d97706;font-weight:700;">⏳ Under Review</span>'),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("📤", "Withdrawal Request Submitted", "#fffbeb", "#92400e")}
    ${para("Your withdrawal request has been received and is under review by our team. We'll notify you once it's processed.")}
    ${table(rows)}
    ${cta("📋 View Transaction History")}${hr()}${note("If you did not request this withdrawal, contact support immediately.")}`;
  return send(cfg, user.email, `📤 Withdrawal Request — ${fmt(data.amount)} under review`, layout(cfg, body),
    `Your withdrawal of ${fmt(data.amount)} via ${methodLabel} is under review. You will receive: ${fmt(data.netAmount)}.`);
}

/* ─── Withdrawal Approved ────────────────────────────────────────────────── */

export async function sendWithdrawalApprovedEmail(
  user: { email: string; name: string },
  data: { amount: number; method: string; account: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const methodLabel = data.method.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const rows = [
    row("Amount", fmt(data.amount), true),
    row("Method", methodLabel),
    row("Account / Phone", data.account),
    row("Approved At", time),
    row("Status", '<span style="color:#16a34a;font-weight:700;">✅ Approved & Processing</span>'),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("✅", "Withdrawal Approved!")}
    ${para(`Great news! Your withdrawal of <strong>${fmt(data.amount)}</strong> has been <strong>approved</strong> and is being processed.`)}
    ${table(rows)}
    ${tip("M-Pesa transfers typically arrive within minutes. Bank transfers may take 1–3 business days.")}
    ${cta("🏦 View My Wallet")}${hr()}${note("Thank you for using Zenti. We appreciate your trust.")}`;
  return send(cfg, user.email, `✅ Withdrawal Approved — ${fmt(data.amount)} being processed`, layout(cfg, body),
    `Your withdrawal of ${fmt(data.amount)} via ${methodLabel} has been approved and is being processed.`);
}

/* ─── Account Banned (Auto-ban notification) ─────────────────────────────── */

export async function sendAccountBannedEmail(
  user: { email: string; name: string },
  data: { reason: string; supportEmail: string; siteUrl: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const body = `
    ${hi(user.name)}
    ${hero("🚫", "Your Account Has Been Suspended", "#fef2f2", "#991b1b")}
    ${alert(`<strong>Your Zenti account has been suspended</strong> due to a violation of our Terms of Service.<br/><br/>
      <strong>Reason:</strong> ${data.reason}`)}
    ${para("Our automated fraud detection system identified activity that violates our platform rules. Violations include but are not limited to:")}
    <ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.8;">
      <li>Creating multiple accounts with the same phone number</li>
      <li>Registering multiple accounts from the same device or network</li>
      <li>Using automated tools or bots to create accounts</li>
      <li>Providing false or misleading identity information</li>
    </ul>
    <div style="background:#fff7ed;border:2px solid #fb923c;border-radius:14px;padding:20px 24px;margin:20px 0;">
      <h3 style="margin:0 0 12px;color:#9a3412;font-size:15px;font-weight:800;">📬 How to Appeal This Decision</h3>
      <p style="margin:0 0 10px;color:#7c2d12;font-size:14px;line-height:1.7;">If you believe this suspension was made in error, you may submit an appeal by emailing our support team. Include:</p>
      <ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:13px;line-height:1.8;">
        <li>Your full name and registered email address</li>
        <li>Your Kenyan phone number (07XX or 01XX format)</li>
        <li>A brief explanation of why you believe the ban was in error</li>
        <li>Any supporting information (e.g., proof of identity)</li>
      </ul>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;"><tr><td align="center">
        <a href="mailto:${data.supportEmail}?subject=Account%20Suspension%20Appeal&body=My%20name%3A%20${encodeURIComponent(user.name)}%0AMy%20email%3A%20${encodeURIComponent(user.email)}%0A%0AReason%20for%20appeal%3A%20" 
           style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">
          📧 Send Appeal to ${data.supportEmail}
        </a>
      </td></tr></table>
    </div>
    ${para("Appeals are reviewed within 24–48 business hours. If your appeal is successful, your account will be reinstated.")}
    ${hr()}${note(`This is an automated message from the Zenti fraud detection system. Account ID: ${user.email}. Zenti — zenti.run.place`)}`;
  return send(cfg, user.email, `🚫 Zenti Account Suspended — Action Required`, layout(cfg, body),
    `Your Zenti account has been suspended.\nReason: ${data.reason}\n\nTo appeal, email: ${data.supportEmail}`);
}

/* ─── Referral Program Welcome (apply flow) ──────────────────────────────── */

export async function sendReferralWelcomeEmail(
  user: { email: string; name: string },
  data: { referralLink: string; referralCode: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const body = `
    ${hi(user.name)}
    ${hero("🤝", "Welcome to the Zenti Referral Program!")}
    ${para("You are now enrolled in the Zenti B2C Referral Program. Here is your unique invite link:")}
    <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:14px;padding:20px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;">YOUR REFERRAL LINK</p>
      <p style="margin:0 0 12px;color:#14532d;font-size:13px;word-break:break-all;font-family:'Courier New',monospace;">${data.referralLink}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">Code: <strong style="color:#14532d;letter-spacing:2px;">${data.referralCode}</strong></p>
    </div>
    <h3 style="margin:24px 0 12px;color:#111827;font-size:15px;font-weight:700;">How the System Works (Auto-Credited — No Action Needed)</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #d1fae5;">
        <span style="font-size:18px;margin-right:10px;vertical-align:middle;">⚡</span>
        <span style="color:#374151;font-size:14px;vertical-align:middle;"><strong>Instant Invitation Bonus:</strong> When your friend makes their first M-Pesa deposit, <strong>10% of that amount is automatically added to your Zenti balance</strong> — instantly, with no action from you.</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #d1fae5;">
        <span style="font-size:18px;margin-right:10px;vertical-align:middle;">📅</span>
        <span style="color:#374151;font-size:14px;vertical-align:middle;"><strong>Sunday Bonus:</strong> Every Sunday at 11:59 PM, our system automatically calculates and credits your referral bonus directly to your balance — <strong>no manual claiming required</strong>.</span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:18px;margin-right:10px;vertical-align:middle;">🏆</span>
        <span style="color:#374151;font-size:14px;vertical-align:middle;"><strong>Elite Bonus (30%):</strong> Get 5 active investors within 10 days to unlock Elite. If you get more than 10 in your first week, you earn an extra 5–10% on top (Legend tier)!</span>
      </td></tr>
    </table>
    ${warningBox("FRAUD WARNING — IMPORTANT: Our system automatically monitors all referral activity for fraud. Creating fake accounts, using bots, or manipulating the referral system will result in an <strong>immediate permanent ban</strong> and forfeiture of all bonuses. Both the referrer and the fake referees will be banned. Play fair and earn real bonuses!")}
    <h3 style="margin:20px 0 12px;color:#111827;font-size:15px;font-weight:700;">Withdrawal of Referral Bonuses</h3>
    ${para("Referral bonuses are credited directly to your Zenti wallet. There is <strong>no minimum withdrawal amount</strong> for referral bonuses. You can withdraw them on the last day of any active investment using M-Pesa or your configured payment method.")}
    ${cta("🔗 Go to My Referrals")}
    ${hr()}${note("You received this because you enrolled in the Zenti Referral Program.")}`;
  return send(cfg, user.email, `🤝 You're Enrolled in the Zenti Referral Program — Your Link is Ready!`, layout(cfg, body),
    `You're enrolled in the Zenti Referral Program.\n\nYour link: ${data.referralLink}\nYour code: ${data.referralCode}\n\nShare your link — when friends invest, you earn automatically!`);
}

/* ─── Referral Enrollment (countdown started) ────────────────────────────── */

export async function sendReferralEnrollmentEmail(
  user: { email: string; name: string },
  data: { referralLink: string; referralCode: string; deadlineDate: Date },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const deadline = fmtDate(data.deadlineDate);
  const body = `
    ${hi(user.name)}
    ${hero("⏳", "Your Elite Challenge Has Started!", "#fff7ed", "#9a3412")}
    ${para("Congratulations! Your first active referral just joined. Your <strong>10-day Elite Challenge</strong> has officially started.")}
    <div style="background:#fff7ed;border:2px solid #fb923c;border-radius:14px;padding:18px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 6px;color:#9a3412;font-size:13px;font-weight:600;">⏰ YOUR DEADLINE</p>
      <p style="margin:0;color:#7c2d12;font-size:18px;font-weight:800;">${deadline}</p>
      <p style="margin:8px 0 0;color:#9a3412;font-size:13px;">Get 4 more active investors before this date to unlock the <strong>30% Elite Sunday Bonus</strong>!</p>
    </div>
    ${para(`<strong>You need 4 more active investors</strong> (people who join via your link and make a real M-Pesa deposit) by ${deadline}. You currently have 1.`)}
    <h3 style="margin:20px 0 10px;color:#111827;font-size:14px;font-weight:700;">🏆 Elite vs Standard Bonus:</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
      <tr style="background:#f0fdf4;">
        <td style="padding:10px 12px;border:1px solid #d1fae5;font-weight:700;color:#14532d;font-size:14px;">Elite (5+ active in 10 days)</td>
        <td style="padding:10px 12px;border:1px solid #d1fae5;font-weight:700;color:#14532d;font-size:14px;">30% every Sunday — forever</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border:1px solid #d1fae5;color:#374151;font-size:14px;">Standard (missed deadline)</td>
        <td style="padding:10px 12px;border:1px solid #d1fae5;color:#374151;font-size:14px;">5–10% every Sunday</td>
      </tr>
      <tr style="background:#fefce8;">
        <td style="padding:10px 12px;border:1px solid #fde68a;font-weight:700;color:#92400e;font-size:14px;">🌟 Legend (10+ in first week!)</td>
        <td style="padding:10px 12px;border:1px solid #fde68a;font-weight:700;color:#92400e;font-size:14px;">35–40% every Sunday — elite bonus!</td>
      </tr>
    </table>
    <p style="margin:0 0 12px;color:#374151;font-size:14px;font-weight:600;">Your referral link:</p>
    <div style="background:#f0fdf4;border:1px solid #d1fae5;border-radius:10px;padding:14px;font-family:'Courier New',monospace;font-size:12px;color:#14532d;word-break:break-all;margin-bottom:20px;">${data.referralLink}</div>
    ${cta("🚀 Share My Link & Go Elite")}
    ${hr()}${note("This is a system notification about your referral program status.")}`;
  return send(cfg, user.email, `⏳ Elite Challenge Started — Get 4 More Investors by ${deadline}!`, layout(cfg, body),
    `Your Elite Challenge has started! Get 4 more active investors by ${deadline} to unlock the 30% Elite Sunday Bonus.\n\nYour link: ${data.referralLink}`);
}

/* ─── Withdrawal Rejected ────────────────────────────────────────────────── */

export async function sendWithdrawalRejectedEmail(
  user: { email: string; name: string },
  data: { amount: number; reason?: string | null },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const rows = [
    row("Amount Refunded", fmt(data.amount), true),
    row("Rejected At", time),
    row("Status", '<span style="color:#dc2626;font-weight:700;">❌ Rejected & Refunded</span>'),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("❌", "Withdrawal Rejected", "#fef2f2", "#991b1b")}
    ${para(`Unfortunately, your withdrawal request was rejected. However, <strong>${fmt(data.amount)}</strong> has been <strong>refunded</strong> to your Zenti wallet immediately.`)}
    ${data.reason ? alert(`<strong>Reason:</strong> ${data.reason}`) : ""}
    ${table(rows)}
    ${para("Your refunded balance is available immediately. Contact our support team if you have questions.")}
    ${cta("📞 Contact Support")}${hr()}${note("Your funds are safe in your wallet and can be withdrawn again when eligible.")}`;
  return send(cfg, user.email, `❌ Withdrawal Rejected — ${fmt(data.amount)} refunded to your wallet`, layout(cfg, body),
    `Your withdrawal of ${fmt(data.amount)} was rejected and refunded.${data.reason ? ` Reason: ${data.reason}` : ""}`);
}
