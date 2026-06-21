---
name: Zenti withdrawal rule
description: Withdrawals are ONLY allowed on the last calendar day of an active investment
---

## Rule
User can only withdraw on the last day of their active investment. If they have no active plan, or today is not the last day of the soonest-completing plan, withdrawal is blocked with a clear error message.

## Implementation (transactions.ts POST /withdraw)
```typescript
function isLastDayKE(completesAt: Date | null): boolean {
  if (!completesAt) return false;
  const now = new Date();
  const kenyaNow = new Date(now.getTime() + 3*60*60*1000);
  const kenyaCompletion = new Date(completesAt.getTime() + 3*60*60*1000);
  return kenyaNow.toISOString().slice(0, 10) === kenyaCompletion.toISOString().slice(0, 10);
}
```
The route checks: 1) user has active investments, 2) isLastDayKE(soonestInvestment.completesAt)

## Dashboard
- canWithdraw + withdrawalUnlocksAt returned from GET /api/dashboard/summary
- Orange "Withdrawal Locked" banner shown when active plan exists but not last day
- Green "Withdrawal Available Today!" banner when canWithdraw is true
- Withdraw button disabled when canWithdraw is false

**Why:** Business requirement — funds are locked in the plan until the last day to prevent early exit.
