import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db";

let cache: Record<string, string> = {};
let cacheExpiry = 0;
const CACHE_TTL = 60_000;

async function loadDbConfig(): Promise<Record<string, string>> {
  if (Date.now() < cacheExpiry) return cache;
  try {
    const [settings] = await db.select({
      configKeys: platformSettingsTable.configKeys,
      payheroAuthToken: platformSettingsTable.payheroAuthToken,
      payheroChannelId: platformSettingsTable.payheroChannelId,
    }).from(platformSettingsTable).limit(1);
    cache = { ...((settings?.configKeys as Record<string, string>) ?? {}) };
    if (settings?.payheroAuthToken) cache["PAYHERO_AUTH_TOKEN"] = settings.payheroAuthToken;
    if (settings?.payheroChannelId) cache["PAYHERO_CHANNEL_ID"] = settings.payheroChannelId;
    cacheExpiry = Date.now() + CACHE_TTL;
  } catch {
    // DB not available — keep old cache
  }
  return cache;
}

export async function getConfig(key: string): Promise<string> {
  const envVal = process.env[key];
  if (envVal) return envVal;
  const dbKeys = await loadDbConfig();
  return dbKeys[key] ?? "";
}

export function invalidateConfigCache() {
  cacheExpiry = 0;
}
