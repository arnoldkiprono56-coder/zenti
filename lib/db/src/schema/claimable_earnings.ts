import { pgTable, serial, integer, timestamp, numeric, boolean, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { investmentsTable } from "./investments";

export const claimableEarningsTable = pgTable("claimable_earnings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  investmentId: integer("investment_id").notNull().references(() => investmentsTable.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  earningDate: text("earning_date").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  claimed: boolean("claimed").notNull().default(false),
  claimedAt: timestamp("claimed_at"),
  expired: boolean("expired").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ClaimableEarning = typeof claimableEarningsTable.$inferSelect;
