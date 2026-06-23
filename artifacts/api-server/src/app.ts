import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { maintenanceMiddleware } from "./middlewares/maintenance";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

const allowedOrigins = [
  process.env["APP_URL"],
  process.env["FRONTEND_URL"],
  "http://localhost:5000",
  "http://localhost:25538",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) { cb(null, true); return; }
      if (allowedOrigins.length === 0 || allowedOrigins.some((o) => origin.startsWith(o))) {
        cb(null, true);
      } else {
        cb(null, true);
      }
    },
    credentials: true,
  }),
);

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: (req) => req.path === "/api/healthz",
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please wait a minute and try again." },
});

const otpLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Please wait a minute." },
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api", globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/otp", otpLimiter);

// Diagnostic endpoint — before all middleware so it always responds instantly
app.get("/api/diag", (_req: Request, res: Response) => {
  const vars = ["NEON_DATABASE_URL", "DATABASE_URL", "SESSION_SECRET", "SMTP_USER", "SMTP_PASS", "APP_URL", "FRONTEND_URL", "NODE_ENV"];
  res.json({
    ok: true,
    env: Object.fromEntries(vars.map((k) => [k, !!process.env[k]])),
  });
});

app.use(maintenanceMiddleware());

app.use("/api", router);

const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// 404 handler for unmatched API routes
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global JSON error handler — must be last, prevents HTML error pages
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status = (err as any).status ?? (err as any).statusCode ?? 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

export default app;
