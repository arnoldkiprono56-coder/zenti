/**
 * IP geolocation — two-layer approach:
 *  1. Vercel edge headers (x-vercel-ip-country) — zero cost, works in serverless
 *  2. geoip-lite lazy dynamic import — local dev fallback only, fails silently
 *
 * Returning null means "country unknown" — callers treat unknown as allowed.
 * The server NEVER crashes if geo lookup fails.
 */

import type { Request } from "express";

const PRIVATE_IPS = ["::1", "127.0.0.1", "localhost", "unknown", ""];
const PRIVATE_PREFIXES = ["10.", "192.168.", "172.16.", "172.17.", "172.18.",
  "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
  "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "fd", "fc", "::f"];

function isPrivate(ip: string): boolean {
  return PRIVATE_IPS.includes(ip) || PRIVATE_PREFIXES.some((p) => ip.startsWith(p));
}

/** Extract country code from Vercel's auto-injected edge headers (free, no library). */
function countryFromVercelHeaders(req: Request): string | null {
  const h = req.headers["x-vercel-ip-country"];
  if (h && typeof h === "string" && h.length === 2) return h.toUpperCase();
  return null;
}

/** Lazy geoip-lite lookup — only used in local dev, never crashes the process. */
async function countryFromGeoip(ip: string): Promise<string | null> {
  try {
    const mod = await import("geoip-lite");
    const geoip = (mod as any).default ?? mod;
    const geo = geoip.lookup(ip);
    return geo?.country ?? null;
  } catch {
    return null;
  }
}

/**
 * Get country code for a request.
 * Always pass the full Request object so Vercel headers can be read.
 */
export async function getCountryFromRequest(req: Request): Promise<string | null> {
  const ip: string = (req as any).clientIp ?? req.ip ?? "unknown";

  if (isPrivate(ip)) return "KE"; // treat local/private as Kenya (dev)

  // Priority 1: Vercel edge header (free, reliable in production)
  const vercelCountry = countryFromVercelHeaders(req);
  if (vercelCountry) return vercelCountry;

  // Priority 2: geoip-lite (local dev)
  return countryFromGeoip(ip);
}

/** Synchronous plain-IP lookup — only for cases where we have no Request. */
export function getCountryFromIp(ip: string): string | null {
  if (!ip || isPrivate(ip)) return "KE";
  // Can't call geoip-lite synchronously in a safe way at module level.
  // Callers that have a Request should use getCountryFromRequest instead.
  return null;
}

export function isKenyaIp(ip: string): boolean {
  if (!ip || isPrivate(ip)) return true;
  return false; // unknown real IP — will be resolved async by getCountryFromRequest
}

export function countryName(code: string): string {
  const map: Record<string, string> = {
    KE: "Kenya", GB: "United Kingdom", US: "United States", TZ: "Tanzania",
    UG: "Uganda", ET: "Ethiopia", NG: "Nigeria", ZA: "South Africa",
    IN: "India", CN: "China", RU: "Russia", DE: "Germany",
    FR: "France", AE: "UAE", CA: "Canada", AU: "Australia",
  };
  return map[code] ?? code;
}
