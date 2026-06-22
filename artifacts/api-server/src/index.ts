import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";

const rawPort = process.env["PORT"];
const port = Number(rawPort ?? "8080");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Daily returns processor — runs at 00:00 Kenya time (21:00 UTC)
  cron.schedule("0 21 * * *", async () => {
    const secret = process.env["CRON_SECRET"] ?? "";
    const url = `http://localhost:${port}/api/cron/process-returns`;
    try {
      const resp = await fetch(url, {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      });
      const data = await resp.json();
      logger.info({ data }, "Cron: process-returns completed");
    } catch (err) {
      logger.error({ err }, "Cron: process-returns failed");
    }
  }, { timezone: "UTC" });

  logger.info("Cron scheduler started — daily returns at 00:00 EAT");
});
