import { Router, Response } from "express";
import { db } from "@workspace/db";
import { usersTable, transactionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const BASE_USERS = 1000;
const BASE_PAID_KES = 500000;

router.get("/", async (_req, res: Response) => {
  const [totalUsers] = await db
    .select({ count: sql<number>`count(*)` })
    .from(usersTable);

  const paid = await db
    .select({ sum: sql<string>`coalesce(sum(amount::numeric),0)` })
    .from(transactionsTable)
    .where(sql`type='withdrawal' AND status='completed'`);

  const earnings = await db
    .select({ sum: sql<string>`coalesce(sum(amount::numeric),0)` })
    .from(transactionsTable)
    .where(sql`type='earning' AND status='completed'`);

  const displayUsers = Number(totalUsers.count) + BASE_USERS;
  const displayPaid = parseFloat(paid[0].sum) + parseFloat(earnings[0].sum) + BASE_PAID_KES;

  res.json({
    users: displayUsers,
    totalPaidKES: displayPaid,
  });
});

export default router;
