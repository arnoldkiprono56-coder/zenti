import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db";

interface MaintenanceCache {
  enabled: boolean;
  message: string;
  eta: string | null;
  fetchedAt: number;
}

let cache: MaintenanceCache | null = null;
const CACHE_TTL_MS = 60_000;

async function getStatus(): Promise<MaintenanceCache> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache;
  try {
    const [s] = await db
      .select({
        maintenanceMode: platformSettingsTable.maintenanceMode,
        maintenanceBannerMessage: platformSettingsTable.maintenanceBannerMessage,
        maintenanceEta: platformSettingsTable.maintenanceEta,
      })
      .from(platformSettingsTable)
      .limit(1);
    cache = {
      enabled: s?.maintenanceMode ?? false,
      message: s?.maintenanceBannerMessage ?? "We are performing scheduled maintenance. We'll be back shortly.",
      eta: s?.maintenanceEta ?? null,
      fetchedAt: now,
    };
  } catch {
    cache = { enabled: false, message: "", eta: null, fetchedAt: now };
  }
  return cache;
}

export function invalidateMaintenanceCache(): void {
  cache = null;
}

const BYPASS = new Set([
  "/api/healthz",
  "/api/auth/login",
  "/api/admin/settings",
]);

export function maintenanceMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.path.startsWith("/api/admin") || BYPASS.has(req.path)) {
      next(); return;
    }
    try {
      const status = await getStatus();
      if (status.enabled) {
        res.status(503).json({ maintenance: true, message: status.message, eta: status.eta });
        return;
      }
    } catch { /* allow through on error */ }
    next();
  };
}
