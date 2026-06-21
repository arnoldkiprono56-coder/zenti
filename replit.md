# Zenti

Zenti is a Kenyan investment platform where everyday Kenyans earn daily returns, deposit via M-Pesa, and track their wealth growth.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080), builds then starts
- `pnpm --filter @workspace/invest-ke run dev` — run the frontend (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-set by Replit)

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- API: Express 5 (port 8080 in dev, Vercel serverless in prod)
- DB: PostgreSQL + Drizzle ORM (Replit built-in DB in dev, Neon in prod)
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (ESM bundle)
- Frontend: React 19 + Vite 7 + Tailwind CSS 4 + TanStack Query

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — Drizzle ORM schema (source of truth for DB)
- `artifacts/api-server/src/` — Express 5 API server
- `artifacts/invest-ke/src/` — React frontend
- `lib/api-client-react/src/generated/` — auto-generated React hooks (do not edit)
- `lib/api-zod/src/generated/` — auto-generated Zod schemas (do not edit)

## Vercel Deployment

Files added for Vercel:
- `vercel.json` — root config: build command, output dir, routes
- `api/index.mjs` — Vercel serverless function entry (re-exports Express app)
- `artifacts/api-server/src/vercel-handler.ts` — exports Express app without starting HTTP server
- `artifacts/api-server/build-vercel.mjs` — Vercel-specific esbuild script (bundles nodemailer, no pino workers)

**Required environment variables in Vercel dashboard:**
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (use Neon: neon.tech) |
| `SESSION_SECRET` | Secret key for JWT signing (any long random string) |
| `SMTP_USER` | Gmail address for sending OTP emails |
| `SMTP_PASS` | Gmail app password |
| `PAYHERO_AUTH_TOKEN` | From PayHero dashboard (base64 clientId:clientSecret) |
| `PAYHERO_CHANNEL_ID` | Numeric channel ID from PayHero dashboard |

Optional:
| Variable | Description |
|---|---|
| `BOT_BASE_URL` | WhatsApp OTP bot URL (falls back to email if not set) |
| `APP_URL` | Your Vercel production URL (for CORS & M-Pesa callbacks) |

**Deploy steps:**
1. Push code to GitHub
2. Import repo in vercel.com → framework preset: **Other**
3. In Vercel project settings → General → set **Framework Preset** to **Other** (prevents auto-detection overriding vercel.json)
4. Add all environment variables above
5. Deploy — Vercel auto-runs the build and deploys

**Vercel config notes:**
- Uses `rewrites` (not `routes`) so Vercel does not mistake the static `outputDirectory` for a Node.js server and search for a JS entrypoint
- `includeFiles: "artifacts/api-server/dist/**"` ensures all bundled API server files are available to the serverless function at runtime
- If you see "No entrypoint found in output directory" again, check that the framework preset is set to **Other** in the Vercel dashboard

## Architecture decisions

- Custom JWT auth (no external provider) — 30-day tokens stored in localStorage
- Express app exported as a Vercel serverless function via `api/index.mjs`; routes rewritten so `/api/*` hits the function and everything else serves the SPA
- Pino logger uses pino-pretty only in dev (no worker threads in production — safe for serverless)
- M-Pesa payments via PayHero STK push; withdrawal only allowed on last day of active investment period
- Fraud detection: auto-bans on duplicate phone, IP flood (>2/hr), device fingerprint flood (>2/24h)

## Product

- Users register, verify via OTP (email or WhatsApp), deposit via M-Pesa, and earn daily returns
- Plans: Internship and Premium; both use a claimable earnings model (must claim by 11:59 PM EAT)
- Admin panel for platform settings, maintenance mode, user management, and manual payouts
- Referral system with payout tracking

## User preferences

- Wants clean Vercel deployment with zero errors

## Gotchas

- API server workflow is configured to run the pre-built dist directly (`dist/index.mjs`) to avoid build delay at startup — run `pnpm --filter @workspace/api-server run build` manually after code changes before restarting
- After changing API schema: run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks/schemas
- `pnpm-lock.yaml` must be committed — Vercel uses `--frozen-lockfile`
- Vercel build uses `build-vercel.mjs` (not `build.mjs`) — bundles nodemailer inline, no pino worker files

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
