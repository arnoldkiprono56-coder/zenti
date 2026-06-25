import nodemailer from "nodemailer";

const APP_URL = "https://zenti-investment-kenya.vercel.app";
const SUPPORT_URL = `${APP_URL}/support`;

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
  ticketNumber?: string;
}

export interface EmailNotificationPayload {
  email: string;
  name?: string;
  subject: string;
  heading: string;
  body: string;
  icon?: string;
  ticketNumber?: string;
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
            <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">
              Questions? <a href="${SUPPORT_URL}" style="color:#16a34a;text-decoration:none;font-weight:600;">Open a support ticket</a>
            </p>
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

function cta(text: string, url = APP_URL): string {
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

function ticketBadge(ticketNumber: string): string {
  return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 16px;margin:16px 0;display:flex;align-items:center;justify-content:space-between;">
    <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Ticket Reference</span>
    <span style="color:#14532d;font-size:13px;font-weight:800;letter-spacing:0.05em;font-family:'Courier New',monospace;">${ticketNumber}</span>
  </div>`;
}

function supportLink(): string {
  return `<a href="${SUPPORT_URL}" style="color:#16a34a;text-decoration:none;font-weight:600;">open a support ticket</a>`;
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
    ${payload.ticketNumber ? ticketBadge(payload.ticketNumber) : ""}
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
    <div style="color:#374151;font-size:15px;line-height:1.7;">${payload.body}</div>
    ${payload.ticketNumber ? ticketBadge(payload.ticketNumber) : ""}`;
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

/* ─── Deposit Initiated ──────────────────────────────────────────────────── */

export async function sendDepositInitiatedEmail(
  user: { email: string; name: string },
  data: { amount: number; phone: string; ticketNumber: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const rows = [
    row("Amount", fmt(data.amount), true),
    row("M-Pesa Number", data.phone),
    row("Status", "⏳ Awaiting confirmation"),
    row("Initiated At", time),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("📲", `M-Pesa Prompt Sent`)}
    ${para("An M-Pesa STK push has been sent to your phone. Please check your phone and enter your M-Pesa PIN to complete the deposit.")}
    ${table(rows)}
    ${ticketBadge(data.ticketNumber)}
    ${tip("If you don't see the M-Pesa prompt within 30 seconds, check that your phone has signal and try again.")}
    ${hr()}${note("Save your ticket reference above for any disputes or support queries.")}`;
  return send(cfg, user.email, `📲 M-Pesa Prompt Sent — ${fmt(data.amount)} deposit pending`, layout(cfg, body),
    `An M-Pesa prompt for ${fmt(data.amount)} has been sent to ${data.phone}. Please enter your PIN to complete the deposit. Ticket: ${data.ticketNumber}`);
}

/* ─── Deposit Confirmed ──────────────────────────────────────────────────── */

export async function sendDepositConfirmedEmail(
  user: { email: string; name: string },
  data: { amount: number; newBalance: number; reference?: string | null; method?: string; ticketNumber?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const rows = [
    row("Amount Deposited", fmt(data.amount), true),
    row("Method", data.method ?? "M-Pesa"),
    ...(data.reference ? [row("M-Pesa Reference", data.reference)] : []),
    row("New Wallet Balance", fmt(data.newBalance), true),
    row("Time", time),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("💰", `${fmt(data.amount)} Deposit Received`)}
    ${para("Your M-Pesa deposit has been received and credited to your Zenti wallet instantly.")}
    ${table(rows)}
    ${data.ticketNumber ? ticketBadge(data.ticketNumber) : ""}
    ${para("Ready to invest? Browse our plans and start earning daily returns.")}
    ${cta("💼 Browse Investment Plans")}${hr()}${note("If you did not make this deposit, ${supportLink()} immediately.")}`;
  return send(cfg, user.email, `💰 Deposit Confirmed — ${fmt(data.amount)} credited to your wallet`, layout(cfg, body),
    `Your deposit of ${fmt(data.amount)} is confirmed. New balance: ${fmt(data.newBalance)}.${data.ticketNumber ? ` Ticket: ${data.ticketNumber}` : ""}`);
}

/* ─── Deposit Failed ──────────────────────────────────────────────────── */

export async function sendDepositFailedEmail(
  user: { email: string; name: string },
  data: { amount: number; phone: string; ticketNumber: string; reason?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const rows = [
    row("Amount", fmt(data.amount), true),
    row("M-Pesa Number", data.phone),
    row("Status", `❌ Failed${data.reason ? ` — ${data.reason}` : ""}`),
    row("Time", time),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("❌", "Deposit Not Completed", "#fef2f2", "#7f1d1d")}
    ${para("Unfortunately, your M-Pesa deposit could not be completed. No money has been deducted from your M-Pesa.")}
    ${table(rows)}
    ${ticketBadge(data.ticketNumber)}
    ${alert("Common reasons: M-Pesa PIN cancelled, insufficient M-Pesa balance, or network timeout. Please try again.")}
    ${cta("🔄 Try Again")}
    ${hr()}${note(`If money was deducted but not credited, ${supportLink()} with your ticket reference.`)}`;
  return send(cfg, user.email, `❌ Deposit Failed — ${fmt(data.amount)} not processed`, layout(cfg, body),
    `Your deposit of ${fmt(data.amount)} failed. No money was deducted. Please try again. Ticket: ${data.ticketNumber}`);
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
    ticketNumber?: string;
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
    ${data.ticketNumber ? ticketBadge(data.ticketNumber) : ""}
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
  data: { planName: string; amountInvested: number; dailyEarning: number; expectedTotal: number; completesAt: Date; durationDays?: number; ticketNumber?: string },
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
    ticketNumber: data.ticketNumber,
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
    ${cta("📊 View My Dashboard")}${hr()}${note("This earning was automatically credited as part of your active investment plan.")}`;
  return send(cfg, user.email, `💸 +${fmt(data.earned)} Daily Return Credited`, layout(cfg, body),
    `+${fmt(data.earned)} ${label.toLowerCase()} credited. New balance: ${fmt(data.newBalance)}.`);
}

/* ─── Withdrawal Requested ───────────────────────────────────────────────── */

export async function sendWithdrawalRequestedEmail(
  user: { email: string; name: string },
  data: { amount: number; fee: number; netAmount: number; method: string; account: string; feePercent: number; ticketNumber?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const methodFmt = String(data.method).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const rows = [
    row("Amount Requested", fmt(data.amount), true),
    row(`Processing Fee (${data.feePercent}%)`, `- ${fmt(data.fee)}`),
    row("You Will Receive", fmt(data.netAmount), true),
    row("Payment Method", methodFmt),
    row("Account / Phone", data.account),
    row("Status", "⏳ Under Review"),
    row("Submitted At", time),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero("📤", "Withdrawal Request Received")}
    ${para("Your withdrawal request has been submitted and is currently under review. You will receive a notification once it is processed.")}
    ${table(rows)}
    ${data.ticketNumber ? ticketBadge(data.ticketNumber) : ""}
    ${tip("Processing typically takes 1–24 hours. Keep your ticket reference for any queries.")}
    ${hr()}${note(`If you did not request this withdrawal, ${supportLink()} immediately.`)}`;
  return send(cfg, user.email, `📤 Withdrawal Request — ${fmt(data.amount)} under review`, layout(cfg, body),
    `Your withdrawal of ${fmt(data.amount)} (net: ${fmt(data.netAmount)}) is under review.${data.ticketNumber ? ` Ticket: ${data.ticketNumber}` : ""}`);
}

/* ─── Withdrawal Processed ───────────────────────────────────────────────── */

export async function sendWithdrawalProcessedEmail(
  user: { email: string; name: string },
  data: { amount: number; netAmount: number; method: string; account: string; status: "completed" | "rejected"; adminNote?: string; ticketNumber?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const approved = data.status === "completed";
  const methodFmt = String(data.method).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const rows = [
    row("Amount", fmt(data.amount), true),
    row("Net Paid Out", fmt(data.netAmount), true),
    row("Method", methodFmt),
    row("Account / Phone", data.account),
    row("Status", approved ? "✅ Processed" : "❌ Rejected"),
    row("Processed At", time),
  ].join("");
  const body = `
    ${hi(user.name)}
    ${hero(approved ? "✅" : "❌", approved ? "Withdrawal Processed!" : "Withdrawal Rejected", approved ? "#f0fdf4" : "#fef2f2", approved ? "#14532d" : "#7f1d1d")}
    ${para(approved
      ? `Your withdrawal of ${fmt(data.netAmount)} has been sent to your ${methodFmt} account (${data.account}).`
      : `Your withdrawal request of ${fmt(data.amount)} was not approved.`)}
    ${table(rows)}
    ${data.ticketNumber ? ticketBadge(data.ticketNumber) : ""}
    ${data.adminNote ? alert(`Admin note: ${data.adminNote}`) : ""}
    ${approved ? cta("📊 View My Dashboard") : `<p style="text-align:center;margin:16px 0;">${supportLink()} if you have questions about this decision.</p>`}
    ${hr()}${note("You received this because your withdrawal request was reviewed.")}`;
  return send(cfg, user.email,
    approved ? `✅ Withdrawal of ${fmt(data.netAmount)} Processed` : `❌ Withdrawal Request Rejected`,
    layout(cfg, body),
    approved ? `Your withdrawal of ${fmt(data.netAmount)} has been processed.` : `Your withdrawal of ${fmt(data.amount)} was rejected.`);
}

/* ─── Account Banned ─────────────────────────────────────────────────────── */

export async function sendAccountBannedEmail(
  user: { email: string; name: string },
  data: { reason: string; supportEmail?: string; siteUrl?: string; ticketNumber?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const body = `
    ${hi(user.name)}
    ${hero("🚫", "Account Suspended", "#fef2f2", "#7f1d1d")}
    ${para("Your Zenti account has been suspended due to a violation of our Terms of Service.")}
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin:16px 0;">
      <p style="margin:0 0 4px;color:#7f1d1d;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Reason</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${data.reason}</p>
    </div>
    ${data.ticketNumber ? ticketBadge(data.ticketNumber) : ""}
    ${para("If you believe this is a mistake, you can submit an appeal. Our team reviews appeals within 48 hours.")}
    ${cta("📋 Submit an Appeal", `${APP_URL}/support`)}
    ${hr()}${note(`To appeal, log in at ${APP_URL} and you will see the appeal form. Alternatively, ${supportLink()}.`)}`;
  return send(cfg, user.email, `🚫 Your ${cfg.fromName} Account Has Been Suspended`, layout(cfg, body),
    `Your ${cfg.fromName} account has been suspended. Reason: ${data.reason}\n\nTo appeal, visit ${APP_URL}/support`);
}

/* ─── Investment Completed ───────────────────────────────────────────────── */

export async function sendInvestmentCompletedEmail(
  user: { email: string; name: string },
  data: { totalEarned: number; newBalance: number; isInternship?: boolean; planName?: string; ticketNumber?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const rows = [
    row("Plan", data.planName ?? (data.isInternship ? "2-Day Internship Package" : "Investment Plan")),
    row("Total Earned", fmt(data.totalEarned), true),
    row("New Wallet Balance", fmt(data.newBalance), true),
    row("Completed At", time),
  ].join("");

  const internshipNote = data.isInternship ? `
    ${warningBox("Your KES 200 internship earnings are locked in your wallet.\n\nTo unlock them and access withdrawals, you must purchase a Premium Plan with a real M-Pesa deposit.")}
    ${cta("💼 Upgrade to Premium Now")}` : `
    ${hero("🎉", "Withdrawal Window Open!", "#f0fdf4", "#14532d")}
    ${para("Today is your withdrawal day. You can now withdraw your earnings from your wallet.")}
    ${cta("💸 Withdraw My Earnings")}`;

  const body = `
    ${hi(user.name)}
    ${hero("🏆", "Investment Complete — Congratulations!")}
    ${para(`Your investment plan has matured and all earnings have been credited to your wallet.`)}
    ${table(rows)}
    ${data.ticketNumber ? ticketBadge(data.ticketNumber) : ""}
    ${internshipNote}
    ${hr()}${note("Ready to earn more? Start a new investment plan today!")}`;

  const subject = data.isInternship
    ? `🎓 Internship Complete — Your earnings are locked, upgrade to unlock!`
    : `🏆 Investment Complete — You can now withdraw your earnings!`;

  return send(cfg, user.email, subject, layout(cfg, body),
    `Your ${data.planName ?? "investment plan"} is complete! Total earned: ${fmt(data.totalEarned)}. New balance: ${fmt(data.newBalance)}.`);
}

/* ─── Dormancy Warning ───────────────────────────────────────────────────── */

export async function sendDormancyWarningEmail(
  user: { email: string; name: string },
  data: { daysUntilClosure: number; ticketNumber?: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const body = `
    ${hi(user.name)}
    ${hero("😴", `Account Closing in ${data.daysUntilClosure} Days`, "#fff7ed", "#92400e")}
    ${para(`Your Zenti account has been inactive since registration — no deposit or active investment has been made.`)}
    ${warningBox(`Your account will be temporarily closed in <strong>${data.daysUntilClosure} day${data.daysUntilClosure !== 1 ? "s" : ""}</strong> unless you make a deposit or activate an investment plan.`)}
    ${para("Don't lose your account! Make your first deposit and start earning daily returns.")}
    ${data.ticketNumber ? ticketBadge(data.ticketNumber) : ""}
    ${cta("💰 Make My First Deposit")}
    ${hr()}${note("If you log in, your account will remain active. Your account is NOT deleted — it can always be reactivated.")}`;
  return send(cfg, user.email, `⚠️ Your Zenti account will close in ${data.daysUntilClosure} days — take action now`, layout(cfg, body),
    `Your Zenti account will be temporarily closed in ${data.daysUntilClosure} days. Log in or make a deposit to keep it active.`);
}

/* ─── Password Reset ─────────────────────────────────────────────────────── */

export async function sendPasswordResetEmail(
  user: { email: string; name: string },
  data: { resetUrl: string },
  smtpConfig?: SmtpConfig,
): Promise<EmailResult> {
  const cfg = smtpConfig ?? getDefaultSmtpConfig();
  const body = `
    ${hi(user.name)}
    ${hero("🔐", "Password Reset Request", "#eff6ff", "#1e40af")}
    ${para("We received a request to reset the password for your Zenti account. Click the button below to set a new password:")}
    <div style="text-align:center;margin:28px 0;">
      <a href="${data.resetUrl}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Reset My Password</a>
    </div>
    ${warningBox("This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.")}
    ${para(`Or copy this link into your browser:<br/><span style="font-size:12px;color:#6b7280;word-break:break-all;">${data.resetUrl}</span>`)}
    ${hr()}${note("For security, never share this link with anyone. Zenti staff will never ask for it.")}`;
  return send(cfg, user.email, "🔐 Reset your Zenti password", layout(cfg, body),
    `Reset your Zenti password using this link (expires in 1 hour): ${data.resetUrl}`);
}
