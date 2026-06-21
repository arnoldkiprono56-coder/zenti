/**
 * PayHero API client — C2B STK push only.
 *
 * Required env vars:
 *   PAYHERO_AUTH_TOKEN  — base64-encoded "clientId:clientSecret" from PayHero dashboard
 *   PAYHERO_CHANNEL_ID  — numeric channel ID from PayHero dashboard
 */

const PAYHERO_BASE = "https://backend.payhero.co.ke/api/v2";

export interface STKPushResult {
  checkoutRequestId: string;
  status: string;
  success: boolean;
}

/** Normalize a Kenyan phone number to 254XXXXXXXXX for PayHero */
export function normalizePhone(phone: string): string {
  const clean = phone.replace(/[\s\-]/g, "");
  if (clean.startsWith("+254")) return clean.slice(1);
  if (clean.startsWith("254")) return clean;
  if (clean.startsWith("07") || clean.startsWith("01")) return "254" + clean.slice(1);
  return clean;
}

/**
 * Initiate an M-Pesa STK push (C2B) via PayHero.
 * Returns the CheckoutRequestID to store as the transaction reference.
 */
export async function initiateSTKPush(opts: {
  amount: number;
  phone: string;
  externalReference: string;
  callbackUrl: string;
  customerName?: string;
}): Promise<STKPushResult> {
  const authToken = process.env["PAYHERO_AUTH_TOKEN"];
  const channelId = process.env["PAYHERO_CHANNEL_ID"];

  if (!authToken || !channelId) {
    throw new Error("PayHero credentials not configured (PAYHERO_AUTH_TOKEN, PAYHERO_CHANNEL_ID)");
  }

  const body = {
    amount: opts.amount,
    phone_number: normalizePhone(opts.phone),
    channel_id: Number(channelId),
    provider: "m-pesa",
    external_reference: opts.externalReference,
    customer_name: opts.customerName ?? "Customer",
    callback_url: opts.callbackUrl,
  };

  const response = await fetch(`${PAYHERO_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${authToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok || data["success"] === false) {
    const msg = (data["message"] as string) ?? `PayHero error ${response.status}`;
    throw new Error(msg);
  }

  return {
    checkoutRequestId: String(data["CheckoutRequestID"] ?? data["checkout_request_id"] ?? ""),
    status: String(data["status"] ?? "Queued"),
    success: true,
  };
}
