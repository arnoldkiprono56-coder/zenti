/**
 * Gemini AI-powered fraud analysis layer.
 * Called after rule-based checks to catch sophisticated patterns
 * that simple rules miss.
 */

import { logger } from "./logger";

export interface GeminiRiskResult {
  riskScore: number;         // 0–100
  recommendation: "allow" | "flag" | "ban";
  reasons: string[];
  rawResponse?: string;
}

interface UserProfile {
  userId: number;
  email: string;
  phone: string;
  registrationIp?: string | null;
  deviceFingerprint?: string | null;
  registrationTimestamp: Date;
  referredById?: number | null;
  accountAgeMinutes?: number;
  existingAccountsFromIp?: number;
  existingAccountsFromDevice?: number;
  hasDeposit?: boolean;
  depositCount?: number;
  withdrawalCount?: number;
  referralCount?: number;
  emailDomain?: string;
}

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

const SYSTEM_PROMPT = `You are an AI fraud analyst for Zenti, a Kenyan mobile investment platform.
Your job is to assess whether a user profile is fraudulent or suspicious.

Kenyan context:
- Legitimate users register with Safaricom (07xx) or Airtel (01xx) Kenyan numbers.
- Legitimate IPs are often Kenyan ISPs (Safaricom, Airtel, Telkom, Faiba, etc).
- Zenti only allows one account per person. Multiple accounts = fraud.
- Common fraud patterns: bulk registrations from same IP/device, referral farming, 
  disposable emails, VPN usage, bot-like registration timing, deposit-withdraw cycling.

Risk scale:
- 0–30: Normal user, allow.
- 31–69: Mildly suspicious, flag for manual review but allow.
- 70–89: Likely fraudulent, flag and restrict.
- 90–100: Definitively fraudulent, auto-ban.

Respond ONLY with valid JSON in exactly this format:
{
  "riskScore": <number 0-100>,
  "recommendation": "<allow|flag|ban>",
  "reasons": ["<specific reason 1>", "<specific reason 2>"]
}

Do not include any explanation outside the JSON.`;

export async function analyzeUserWithGemini(
  profile: UserProfile,
): Promise<GeminiRiskResult> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    logger.debug("GEMINI_API_KEY not set — skipping AI fraud analysis");
    return { riskScore: 0, recommendation: "allow", reasons: ["Gemini not configured"] };
  }

  const emailDomain = profile.email.split("@")[1] ?? "unknown";
  const profileText = `
User ID: ${profile.userId}
Email domain: ${emailDomain}
Phone prefix: ${profile.phone.slice(0, 4)}
Registration IP: ${profile.registrationIp ?? "unknown"}
Device fingerprint: ${profile.deviceFingerprint ? "present" : "absent"}
Account age (minutes since registration): ${profile.accountAgeMinutes ?? 0}
Referred by another user: ${profile.referredById ? "yes" : "no"}
Other accounts from same IP (last hour): ${profile.existingAccountsFromIp ?? 0}
Other accounts from same device (last 24h): ${profile.existingAccountsFromDevice ?? 0}
Has made a real M-Pesa deposit: ${profile.hasDeposit ? "yes" : "no"}
Total deposits: ${profile.depositCount ?? 0}
Total withdrawals: ${profile.withdrawalCount ?? 0}
Total referrals recruited: ${profile.referralCount ?? 0}
`.trim();

  let rawText = "";
  try {
    const resp = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nAnalyse this user profile:\n\n${profileText}` }] },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      logger.warn({ status: resp.status, err }, "Gemini API returned non-200");
      return { riskScore: 0, recommendation: "allow", reasons: ["Gemini API error"] };
    }

    const json = await resp.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Extract JSON from Gemini's response (it may wrap in markdown code fences)
    const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("No JSON in Gemini response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      riskScore?: number;
      recommendation?: string;
      reasons?: string[];
    };

    const riskScore = Math.max(0, Math.min(100, Number(parsed.riskScore ?? 0)));
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [];
    let recommendation: "allow" | "flag" | "ban" = "allow";
    if (riskScore >= 90) recommendation = "ban";
    else if (riskScore >= 70) recommendation = "flag";
    else if (parsed.recommendation === "flag") recommendation = "flag";

    logger.info({ userId: profile.userId, riskScore, recommendation, reasons }, "Gemini fraud analysis complete");
    return { riskScore, recommendation, reasons, rawResponse: rawText };
  } catch (err: unknown) {
    logger.warn({ err, rawText, userId: profile.userId }, "Gemini fraud analysis failed — defaulting to allow");
    return { riskScore: 0, recommendation: "allow", reasons: ["Gemini analysis failed"] };
  }
}
