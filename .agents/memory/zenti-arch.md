---
name: Zenti project architecture
description: Stack, ports, artifact locations, and key patterns for the Zenti investment platform
---

## Stack
- **Backend:** Express v5 + TypeScript, Drizzle ORM, Neon PostgreSQL
- **Frontend:** React + Vite + Wouter + TanStack Query + shadcn/ui
- **Email:** Nodemailer (SMTP via env SMTP_USER / SMTP_PASS)
- **Payments:** PayHero STK Push for M-Pesa
- **WhatsApp:** Custom lib/whatsapp.ts (BOT_BASE_URL + BOT_SHARED_SECRET env)

## Artifact layout
- `artifacts/api-server/` — Express API, runs on port 8080
- `artifacts/invest-ke/` — React frontend, runs on port 5000 (PORT=5000 env)
- `artifacts/mockup-sandbox/` — Design preview server, port 8081

## Key env vars needed
SESSION_SECRET, SMTP_USER, SMTP_PASS, DATABASE_URL, PAYHERO_AUTH_TOKEN, PAYHERO_CHANNEL_ID, BOT_BASE_URL, BOT_SHARED_SECRET, CRON_SECRET

## Patterns
- Frontend uses `import.meta.env.BASE_URL` for API paths (never root-relative `/api/...`)
- Email layout() now takes cfg object (not just fromName) to avoid hardcoded values
- All fire-and-forget notifications wrapped in self-invoking async IIFE to avoid blocking response

**Why:** Frontend is proxied through Replit's path-based routing; root-relative URLs escape the artifact path prefix.
