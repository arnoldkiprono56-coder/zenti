/**
 * Zenti AI Support Assistant — powered by Gemini 1.5 Flash
 * Has deep knowledge of the Zenti platform and handles support tickets autonomously.
 */

import { logger } from "./logger";

export interface SupportReply {
  reply: string;
  shouldClose: boolean;
  confidence: number;          // 0–1
  needsHuman: boolean;         // true if AI recommends escalation
  category: string;            // what type of issue this was
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
  message: string;              // initial message
  userName: string;
  userEmail: string;
  userPhone?: string | null;
}

interface UserContext {
  balance?: number;
  activeInvestments?: number;
  totalDeposited?: number;
  totalWithdrawn?: number;
  status?: string;
  joinedAt?: string;
  lastLogin?: string;
}

// ─── Comprehensive Zenti Platform Knowledge Base ──────────────────────────────

const ZENTI_SYSTEM_PROMPT = `You are Zenti AI, the official support assistant for Zenti — a Kenyan digital investment platform. You are knowledgeable, professional, warm, and concise. You respond in English but can acknowledge Swahili greetings naturally.

## About Zenti
Zenti is a platform where Kenyans invest money and earn fixed daily returns. Users deposit via M-Pesa, choose an investment plan, and earn money each day. All plans have fixed (not guaranteed) daily return rates and a fixed duration.

## Investment Plans
- **Internship Package**: Free 2-day starter plan for new users. Earns KES 200 total (KES 100/day). No deposit needed.
- **Premium Plans**: Paid plans at fixed prices. Users deposit the plan cost via M-Pesa, then invest. Each plan has a fixed daily return % and duration (days). Returns and total earnings are shown before investing.
- Minimum deposit: KES 1.

## Critical Daily Claiming Rule — the most common support issue
- Earnings are NOT automatic. Users must log in every day and click "Claim Now" on their dashboard.
- Deadline: **11:59 PM Kenya time (EAT) daily**.
- Unclaimed earnings expire permanently at midnight and CANNOT be recovered. This is a firm platform rule.
- If a user missed claiming, their earnings are gone. Be empathetic but explain the rule clearly.

## Withdrawal Rules
- Users can ONLY withdraw on the **last calendar day** of their active investment plan.
- Early withdrawal is not possible — this is by design, not a bug.
- If the user says they can't withdraw, check if today is the last day of their plan.
- Minimum withdrawal: KES 200. Processing fee: up to 10%.
- Processing time: within 24 hours (M-Pesa) or 1–3 business days (bank).

## M-Pesa Deposits
- Deposits are done via STK Push (the user gets a popup on their phone to enter their M-Pesa PIN).
- It can take 10–30 seconds to receive the prompt after clicking "Pay".
- If the prompt doesn't arrive: user should check M-Pesa balance, ensure correct number, and try again.
- Deposits are credited instantly after M-Pesa confirmation.
- Common issue: user says "I paid but balance not updated" — this usually means the STK push timed out or was declined. Ask them to check their M-Pesa message history. If they see a deduction, escalate (rare — needs admin balance adjustment).

## Account Issues
- OTP: Sent via WhatsApp or email. If not received, check spam/junk folder. Resend after 60 seconds.
- Forgot password: Use "Forgot password?" on login page — a reset link is emailed.
- Banned accounts: If auto-banned, users can submit an appeal at /support. Bans happen for: duplicate phone numbers, multiple accounts from same IP/device, suspicious referral activity.
- One account per person — multiple accounts are not allowed.

## Referral Program
- Users get a referral link to share. When a referred user deposits and invests, both earn a bonus.
- Referral bonuses are credited automatically.
- Self-referrals and fake referrals result in account bans.

## Device Trust / OTP Login
- After verifying OTP on login, the device is trusted for the rest of that day — no OTP needed again until the next Kenya date.

## Admin Balance Adjustment
- If a user's M-Pesa was deducted but balance wasn't credited, an admin can manually credit the balance after verification. Ask for: M-Pesa transaction reference, phone number, amount, date/time.

## Things Zenti CANNOT do
- Recover expired/unclaimed earnings (firm rule, no exceptions)
- Allow early withdrawal before the last day of a plan
- Remove the daily claiming requirement
- Process withdrawals to phones not registered with M-Pesa

## Escalation triggers (when to say "our team will review")
- User claims M-Pesa was deducted but not credited (needs admin verification)
- Account banned and user insists it's an error
- Technical bugs (the app is broken, features not loading)
- Legal or regulatory questions
- Anything involving suspected fraud by third parties

## Tone Guidelines
- Be warm and helpful: "Hi [Name]! 😊"
- Be direct and specific — no vague answers
- For resolved issues: confirm clearly and ask if anything else is needed
- For uncovered topics: be honest — "Our support team will look into this for you."
- Keep replies under 200 words unless the issue is complex
- Use bullet points for multi-step instructions

## Response Format
Your reply will be sent directly to the user in their support chat. Write it as a direct message (not "The user should..."). Start with a greeting using their name.

Respond with valid JSON:
{
  "reply": "<full reply text — direct message to the user>",
  "shouldClose": <true if this fully resolves the issue, false if it needs follow-up>,
  "confidence": <0.0 to 1.0 — how confident you are in your answer>,
  "needsHuman": <true if an admin needs to take action like balance adjustment, false otherwise>,
  "category": "<what type of issue: claiming|withdrawal|deposit|account|referral|plan_info|technical|other>"
}`;

// ─── Main generation function ─────────────────────────────────────────────────

export async function generateSupportReply(
  ticket: TicketContext,
  history: ConversationMessage[],
  userCtx?: UserContext,
): Promise<SupportReply> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    logger.debug("GEMINI_API_KEY not set — AI support disabled");
    return {
      reply: "",
      shouldClose: false,
      confidence: 0,
      needsHuman: true,
      category: "other",
    };
  }

  const conversationText = history
    .map(m => `[${m.sender.toUpperCase()}]: ${m.message}`)
    .join("\n");

  const userInfo = userCtx
    ? `\nUser Account Info:\n- Balance: KES ${userCtx.balance?.toFixed(2) ?? "unknown"}\n- Active investments: ${userCtx.activeInvestments ?? "unknown"}\n- Account status: ${userCtx.status ?? "active"}\n- Member since: ${userCtx.joinedAt ?? "unknown"}`
    : "";

  const userMessage = `
Support Ticket #${ticket.id}
Subject: ${ticket.subject}
Category: ${ticket.category}
Priority: ${ticket.priority}
User: ${ticket.userName} (${ticket.userEmail}${ticket.userPhone ? `, ${ticket.userPhone}` : ""})
${userInfo}

Conversation:
${conversationText || `[USER]: ${ticket.message}`}

Generate a support reply for the LATEST user message in the conversation above.`;

  let rawText = "";
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${ZENTI_SYSTEM_PROMPT}\n\n${userMessage}` }] },
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(15_000),
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
      { ticketId: ticket.id, confidence, shouldClose: parsed.shouldClose, needsHuman: parsed.needsHuman },
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
    logger.warn({ err, rawText, ticketId: ticket.id }, "Gemini support reply failed");
    return { reply: "", shouldClose: false, confidence: 0, needsHuman: true, category: "other" };
  }
}
