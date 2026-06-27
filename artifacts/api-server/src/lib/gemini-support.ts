/**
 * Zenti AI Support Assistant — powered by Gemini 1.5 Flash
 * Has deep, real-time knowledge of the user's account and the full Zenti platform.
 */

import { logger } from "./logger";

export interface SupportReply {
  reply: string;
  shouldClose: boolean;
  confidence: number;       // 0–1
  needsHuman: boolean;      // true if AI recommends escalation
  category: string;         // type of issue
}

interface ConversationMessage {
  sender: string;
  message: string;
  createdAt: Date | string;
}

interface TicketContext {
  id: number;
  subject: string;
  category: string;
  priority: string;
  message: string;
  userName: string;
  userEmail: string;
  userPhone?: string | null;
}

export interface ActiveInvestment {
  planName: string;
  isInternship: boolean;
  amountInvested: number;
  dailyEarning: number;
  totalEarned: number;
  expectedTotal: number;
  startedAt: string;
  completesAt: string | null;    // the last withdrawal-eligible day
  daysLeft: number | null;
  status: string;
}

export interface RecentTransaction {
  type: "deposit" | "withdrawal" | "earning";
  amount: number;
  fee: number;
  status: string;
  method: string | null;
  reference: string | null;
  createdAt: string;
}

export interface TodayClaim {
  investmentId: number;
  planName: string;
  amount: number;
  claimed: boolean;
  expired: boolean;
}

export interface UserContext {
  // Identity
  fullName: string;
  email: string;
  phone: string;
  accountStatus: string;          // active | suspended | banned | dormant
  bannedReason?: string | null;
  joinedAt: string;               // YYYY-MM-DD
  registrationCountry?: string | null;
  lastLoginAt?: string | null;    // ISO timestamp

  // Money
  balance: number;
  lockedBalance: number;
  totalEarned: number;

  // Investments
  activeInvestments: ActiveInvestment[];
  totalDeposited: number;
  totalWithdrawn: number;

  // Claims today (EAT date)
  todayClaims: TodayClaim[];
  hasPendingClaimToday: boolean;

  // Recent activity
  recentTransactions: RecentTransaction[];

  // Referrals
  referralCode: string | null;
  referralStatus: string;
  totalReferrals: number;
  activeReferrals: number;

  // Internship
  isInternshipEligible: boolean;
  internshipActivated: boolean;
}

// ─── Comprehensive Zenti Platform Knowledge Base ──────────────────────────────

const ZENTI_SYSTEM_PROMPT = `You are Zenti AI, the official intelligent support assistant for Zenti — a Kenyan digital investment platform. You are warm, professional, empathetic, and highly knowledgeable about every aspect of the platform. You have access to the user's real-time account data and must use it to give specific, personalized answers — never generic ones.

## About Zenti
Zenti is a platform where Kenyans invest money and earn fixed daily returns. Users deposit via M-Pesa, choose an investment plan, and earn money each day. All plans have fixed daily return rates and a fixed duration.

## Investment Plans
- **Internship Package**: Free 2-day starter plan for new users. Earns KES 200 total (KES 100/day). No deposit needed. Only one per account.
- **Premium Plans**: Paid plans at fixed prices. Users deposit the plan cost via M-Pesa, then invest. Each plan has a fixed daily return % and duration (days).
- Minimum deposit: KES 1.

## Critical Daily Claiming Rule — the most common support issue
- Earnings are NOT automatic. Users must log in every day and click "Claim Now" on their dashboard.
- Deadline: **11:59 PM Kenya time (EAT) daily**.
- Unclaimed earnings expire permanently at midnight and CANNOT be recovered. This is a firm platform rule with no exceptions.
- If a user missed claiming, be empathetic but firm: the earnings cannot be recovered.
- If they have a pending claim today, remind them to claim before 11:59 PM EAT.

## Withdrawal Rules
- Users can ONLY withdraw on the **last calendar day** of their active investment plan.
- Early withdrawal is not possible — this is by design, not a bug.
- Minimum withdrawal: KES 200. Processing fee: up to 10%.
- Processing time: within 24 hours (M-Pesa) or 1–3 business days (bank).
- If they ask why they can't withdraw, use their investment end date from the account data to explain exactly when they can.

## M-Pesa Deposits
- Done via STK Push (user gets a popup on their phone to enter M-Pesa PIN).
- Takes 10–30 seconds to arrive. If it doesn't: check M-Pesa balance, ensure correct number, try again.
- Deposits credited instantly after M-Pesa confirmation.
- If user says "I paid but balance not updated": check their recent transactions in the account data. If there's a pending/failed deposit, tell them the status. If M-Pesa confirmed but Zenti didn't credit, escalate — this needs admin balance adjustment and requires: M-Pesa transaction reference, phone number, amount, date/time.

## Account & Security
- OTP: Sent via WhatsApp or email. If not received, check spam/junk. Resend after 60 seconds.
- Forgot password: Use "Forgot password?" on login page — reset link is emailed.
- Banned accounts: Users can submit an appeal at /support. Bans happen for: duplicate phone numbers, multiple accounts from same IP/device, suspicious referral activity.
- One account per person strictly. Multiple accounts lead to permanent bans.
- Device trust: After OTP verification, device is trusted until the next Kenya calendar date.

## Referral Program
- Users get a unique referral link to share. When a referred user deposits and invests, both earn a referral bonus.
- Bonuses credited automatically.
- Self-referrals and fake referrals (coordinated accounts) result in bans.
- Use the user's referral data to answer questions about their referral status specifically.

## Admin Balance Adjustment
- If M-Pesa was deducted but balance not credited, an admin can manually credit after verification.
- Required info: M-Pesa transaction reference, phone number, amount, date and time.

## Things Zenti CANNOT do (firm rules, no exceptions)
- Recover expired/unclaimed earnings
- Allow early withdrawal before the last day of a plan
- Remove the daily claiming requirement
- Remove claiming deadlines
- Process withdrawals to phones not registered with M-Pesa

## Escalation triggers (when to say "our team will review")
- M-Pesa deducted but not credited (needs admin verification)
- Account banned and user insists it's an error (direct to /support for appeal)
- Technical bugs — features not loading or broken
- Legal or regulatory questions
- Anything involving suspected fraud by third parties

## Tone & Style
- Always greet by first name: "Hi [FirstName]! 😊"
- Be direct and specific — use their actual account data (balance, investment end dates, claim status, transaction history) in your reply
- Do NOT give generic answers if you have the user's real data
- For resolved issues: confirm clearly and ask if anything else is needed
- Keep replies under 250 words unless the issue is genuinely complex
- Use bullet points for multi-step instructions
- For withdrawal queries: state the exact date they can withdraw based on their investment completesAt date

## Response Format
Your reply will be sent directly to the user in their support chat. Write as a direct message (NOT "The user should..."). Use their first name.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "reply": "<full reply text — direct message to the user>",
  "shouldClose": <true if this fully resolves the issue, false if follow-up is needed>,
  "confidence": <0.0 to 1.0 — how confident you are>,
  "needsHuman": <true if admin action is needed like balance adjustment, false otherwise>,
  "category": "<claiming|withdrawal|deposit|account|referral|plan_info|technical|other>"
}`;

// ─── Build a rich, structured account snapshot for the prompt ─────────────────

function buildAccountContext(ctx: UserContext): string {
  const today = new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "long" });
  const firstName = ctx.fullName.split(" ")[0];

  const lines: string[] = [
    `━━━ REAL-TIME ACCOUNT DATA (as of ${today} EAT) ━━━`,
    `Name: ${ctx.fullName} (first name: ${firstName})`,
    `Email: ${ctx.email}`,
    `Phone: ${ctx.phone}`,
    `Account Status: ${ctx.accountStatus.toUpperCase()}${ctx.bannedReason ? ` — Reason: ${ctx.bannedReason}` : ""}`,
    `Member Since: ${ctx.joinedAt}`,
    ctx.registrationCountry ? `Registered From: ${ctx.registrationCountry}` : "",
    ctx.lastLoginAt ? `Last Login: ${new Date(ctx.lastLoginAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} EAT` : "Last Login: Never",
    "",
    `── Wallet ──`,
    `Available Balance: KES ${ctx.balance.toFixed(2)}`,
    `Locked Balance: KES ${ctx.lockedBalance.toFixed(2)}`,
    `Total Ever Earned: KES ${ctx.totalEarned.toFixed(2)}`,
    `Total Deposited: KES ${ctx.totalDeposited.toFixed(2)}`,
    `Total Withdrawn: KES ${ctx.totalWithdrawn.toFixed(2)}`,
    "",
  ];

  if (ctx.activeInvestments.length === 0) {
    lines.push("── Investments: None active ──");
  } else {
    lines.push(`── Active Investments (${ctx.activeInvestments.length}) ──`);
    ctx.activeInvestments.forEach((inv, i) => {
      lines.push(
        `  #${i + 1}: ${inv.planName}${inv.isInternship ? " [INTERNSHIP]" : ""}`,
        `    Invested: KES ${inv.amountInvested.toFixed(2)} | Daily Earning: KES ${inv.dailyEarning.toFixed(2)}`,
        `    Total Earned So Far: KES ${inv.totalEarned.toFixed(2)} / KES ${inv.expectedTotal.toFixed(2)} expected`,
        `    Started: ${inv.startedAt}`,
        inv.completesAt
          ? `    ENDS / WITHDRAWAL ELIGIBLE: ${inv.completesAt}${inv.daysLeft !== null ? ` (${inv.daysLeft === 0 ? "TODAY — can withdraw now!" : `in ${inv.daysLeft} day${inv.daysLeft === 1 ? "" : "s"}`})` : ""}`
          : `    End Date: Not set`,
      );
    });
  }

  lines.push("");
  if (ctx.todayClaims.length === 0) {
    lines.push("── Today's Claims: No claimable earnings today ──");
  } else {
    lines.push(`── Today's Claims (EAT date: ${today}) ──`);
    ctx.todayClaims.forEach(c => {
      const statusLabel = c.claimed ? "✅ CLAIMED" : c.expired ? "❌ EXPIRED" : "⏳ PENDING — must claim by 11:59 PM EAT";
      lines.push(`  ${c.planName}: KES ${c.amount.toFixed(2)} — ${statusLabel}`);
    });
    if (ctx.hasPendingClaimToday) {
      lines.push("  ⚠️  USER HAS UNCLAIMED EARNINGS TODAY — remind them to claim before midnight EAT!");
    }
  }

  lines.push("");
  if (ctx.recentTransactions.length === 0) {
    lines.push("── Recent Transactions: None ──");
  } else {
    lines.push("── Recent Transactions (last 5) ──");
    ctx.recentTransactions.forEach(tx => {
      const date = new Date(tx.createdAt).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });
      const fee = tx.fee > 0 ? ` (fee: KES ${tx.fee.toFixed(2)})` : "";
      const ref = tx.reference ? ` | Ref: ${tx.reference}` : "";
      lines.push(`  ${tx.type.toUpperCase()} KES ${tx.amount.toFixed(2)} — ${tx.status.toUpperCase()}${fee}${ref} — ${date}${tx.method ? ` via ${tx.method}` : ""}`);
    });
  }

  lines.push("");
  lines.push("── Referrals ──");
  lines.push(
    `  Code: ${ctx.referralCode ?? "none"}`,
    `  Status: ${ctx.referralStatus}`,
    `  Total Referred: ${ctx.totalReferrals} | Active (invested): ${ctx.activeReferrals}`,
  );

  lines.push("");
  lines.push("── Internship ──");
  lines.push(
    `  Eligible: ${ctx.isInternshipEligible ? "Yes" : "No"} | Activated: ${ctx.internshipActivated ? "Yes (already used)" : "No"}`,
  );

  lines.push("━━━ END OF ACCOUNT DATA ━━━");

  return lines.filter(l => l !== undefined).join("\n");
}

// ─── Main generation function ─────────────────────────────────────────────────

export async function generateSupportReply(
  ticket: TicketContext,
  history: ConversationMessage[],
  userCtx?: UserContext,
): Promise<SupportReply> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    logger.debug("GEMINI_API_KEY not set — AI support disabled");
    return { reply: "", shouldClose: false, confidence: 0, needsHuman: true, category: "other" };
  }

  const conversationText = history
    .map(m => {
      const label = m.sender === "user" ? "USER" : m.sender === "admin" ? "SUPPORT" : "SYSTEM";
      return `[${label}]: ${m.message}`;
    })
    .join("\n\n");

  const accountSection = userCtx
    ? `\n${buildAccountContext(userCtx)}\n`
    : "\n[No account linked — user submitted without logging in]\n";

  const userMessage = `
Support Ticket #${ticket.id}
Subject: ${ticket.subject}
Category: ${ticket.category}
Priority: ${ticket.priority}
User: ${ticket.userName} (${ticket.userEmail}${ticket.userPhone ? `, ${ticket.userPhone}` : ""})
${accountSection}
Conversation History:
${conversationText || `[USER]: ${ticket.message}`}

Task: Generate a personalized support reply to the LATEST user message above. Use the account data to give specific, accurate answers. Do not give generic answers if you have real data to use.`;

  let rawText = "";
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${ZENTI_SYSTEM_PROMPT}\n\n${userMessage}` }] },
          ],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!resp.ok) {
      const err = await resp.text();
      logger.warn({ status: resp.status, err }, "Gemini Support API error");
      return { reply: "", shouldClose: false, confidence: 0, needsHuman: true, category: "other" };
    }

    const json = await resp.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Try to extract JSON — Gemini sometimes wraps in ```json blocks
    const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("No JSON in Gemini response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      reply?: string;
      shouldClose?: boolean;
      confidence?: number;
      needsHuman?: boolean;
      category?: string;
    };

    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    const reply = String(parsed.reply ?? "").trim();

    if (!reply) throw new Error("Empty reply from Gemini");

    logger.info(
      { ticketId: ticket.id, confidence, shouldClose: parsed.shouldClose, needsHuman: parsed.needsHuman, category: parsed.category },
      "Gemini support reply generated",
    );

    return {
      reply,
      shouldClose: Boolean(parsed.shouldClose) && confidence >= 0.8,
      confidence,
      needsHuman: Boolean(parsed.needsHuman),
      category: String(parsed.category ?? "other"),
    };
  } catch (err: unknown) {
    logger.warn({ err, rawText: rawText.slice(0, 300), ticketId: ticket.id }, "Gemini support reply failed");
    return { reply: "", shouldClose: false, confidence: 0, needsHuman: true, category: "other" };
  }
}
