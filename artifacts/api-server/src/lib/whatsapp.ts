import { getConfig } from "./config";

function toE164Kenya(phone: string): string {
  const cleaned = phone.replace(/[\s\-]/g, "");
  if (cleaned.startsWith("+254")) return cleaned.slice(1);
  if (cleaned.startsWith("254"))  return cleaned;
  if (cleaned.startsWith("07"))   return "254" + cleaned.slice(1);
  if (cleaned.startsWith("01"))   return "254" + cleaned.slice(1);
  return cleaned;
}

export interface OtpPayload {
  phone: string;
  code: string;
  reason?: string;
  location?: string;
  ip?: string;
}

export interface GatewayResult {
  ok: boolean;
  delivered: boolean;
  error?: string;
}

async function callGateway(endpoint: string, body: object): Promise<GatewayResult> {
  const GATEWAY_URL = (await getConfig("BOT_BASE_URL")).replace(/\/+$/, "");
  const BOT_SECRET = await getConfig("BOT_SHARED_SECRET");

  if (!GATEWAY_URL) {
    return { ok: false, delivered: false, error: "BOT_BASE_URL not configured" };
  }
  try {
    const res = await fetch(`${GATEWAY_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": BOT_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, delivered: false, error: `Gateway ${res.status}: ${text}` };
    }
    return await res.json() as GatewayResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gateway unreachable";
    return { ok: false, delivered: false, error: message };
  }
}

export async function sendOtp(payload: OtpPayload): Promise<GatewayResult> {
  return callGateway("/send-otp", {
    phone: toE164Kenya(payload.phone),
    code: payload.code,
    reason: payload.reason ?? "Verification",
    location: payload.location,
    ip: payload.ip,
  });
}

export async function sendMessage(phone: string, text: string): Promise<GatewayResult> {
  return callGateway("/send-message", { phone: toE164Kenya(phone), text });
}

export async function checkGatewayStatus(): Promise<{ connected: boolean; phone?: string; error?: string }> {
  const GATEWAY_URL = (await getConfig("BOT_BASE_URL")).replace(/\/+$/, "");
  const BOT_SECRET = await getConfig("BOT_SHARED_SECRET");

  if (!GATEWAY_URL) return { connected: false, error: "BOT_BASE_URL not configured" };
  try {
    const res = await fetch(`${GATEWAY_URL}/status`, {
      headers: { "x-bot-secret": BOT_SECRET },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { connected: boolean; phone?: string };
    return { connected: data.connected, phone: data.phone };
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : "Unreachable" };
  }
}
