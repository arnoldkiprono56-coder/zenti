import geoip from "geoip-lite";

const PRIVATE_IPS = ["::1", "127.0.0.1", "localhost"];
const PRIVATE_PREFIXES = ["10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "fd", "fc"];

export function getCountryFromIp(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  if (PRIVATE_IPS.includes(ip)) return "KE";
  if (PRIVATE_PREFIXES.some((p) => ip.startsWith(p))) return "KE";

  try {
    const geo = geoip.lookup(ip);
    return geo?.country ?? null;
  } catch {
    return null;
  }
}

export function isKenyaIp(ip: string): boolean {
  const country = getCountryFromIp(ip);
  return country === null || country === "KE";
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
