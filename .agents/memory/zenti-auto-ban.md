---
name: Zenti auto-ban system
description: How the automated fraud detection and account suspension system works
---

## How it works
After registration succeeds (user gets JWT, sees success screen), a `setTimeout` of 2 minutes fires `autoBanCheck()` in the background. The user is NOT denied at registration; the ban is silent.

## Three ban rules (in order)
1. **Duplicate phone** — any other user with same phone → ban the new account; if the matching account is <60min old, ban it too
2. **IP flood** — >2 non-banned accounts from same IP registered in last 60 minutes → ban all new ones from that IP
3. **Device fingerprint flood** — >2 non-banned accounts with same fingerprint in last 24 hours → ban all

## Fingerprint construction
`buildDeviceFingerprint(userAgent, acceptLanguage)` — simple Java-style int hash of `"${ua}|${lang}"`, prefix `fp_`, stored on usersTable.deviceFingerprint. No external packages needed.

## DB columns added to usersTable
- `registrationIp` text
- `deviceFingerprint` text
- `bannedReason` text
- `bannedAt` timestamp

## Ban notification
`sendAccountBannedEmail()` in email.ts — sent fire-and-forget after ban. Includes specific reason, list of violations, mailto appeal link pre-filled with user name/email, address: support@zenti.run.place.

## Login/me responses for banned accounts
HTTP 403, body includes `{ banned: true, reason, supportEmail: "support@zenti.run.place" }`.

## Appeal process
Email support@zenti.run.place with name, email, phone, and explanation. Reviewed in 24-48 business hours.

**Why:** Platform wanted silent banning (not registration denial) so fraudsters can't immediately retry with different emails. The 2-min delay ensures welcome email lands first, giving genuine users a grace window.
