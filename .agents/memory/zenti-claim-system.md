---
name: Zenti claim system
description: Daily earnings claim logic — users must claim by 11:59 PM EAT or earnings expire
---

## DB Table: claimable_earnings
Fields: userId, investmentId, amount, earningDate (text "en-KE" date string), expiresAt (23:59:59 EAT = 20:59:59 UTC), claimed, claimedAt, expired, createdAt

## Cron flow (POST /api/cron/process-returns)
1. Expire unclaimed earnings where expiresAt < now (set expired=true)
2. Find active investments where lastEarningAt < 24h ago
3. For non-final days: insert claimable_earnings record; do NOT credit wallet; notify user via WhatsApp + email
4. For final day (completesAt <= now OR totalEarned >= expectedTotal): auto-credit wallet, mark investment completed

## User claim flow (POST /api/earnings/claim)
- Checks earningDate = today in Kenya time, not expired, not claimed
- Marks claimed=true, credits wallet
- Returns claimed amount

## Expiry time calculation
Kenya is UTC+3. Expires at 23:59:59 EAT = 20:59:59 UTC
```js
const kenyaNow = new Date(now.getTime() + 3*60*60*1000);
new Date(Date.UTC(kenyaNow.getUTCFullYear(), kenyaNow.getUTCMonth(), kenyaNow.getUTCDate(), 20, 59, 59, 999))
```

## Frontend
Dashboard polls GET /api/earnings/claimable (direct fetch, not generated hook). Shows countdown + green Claim button when totalClaimable > 0.

**Why:** Business requirement — unclaimed earnings must be lost at midnight EAT to incentivize daily logins.
