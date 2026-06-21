import { pgTable, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralPayoutsTable = pgTable("referral_payouts", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => usersTable.id),
  refereeEarningsTotal: numeric("referee_earnings_total", { precision: 14, scale: 2 }).notNull(),
  bonusPercent: numeric("bonus_percent", { precision: 5, scale: 2 }).notNull(),
  bonusAmount: numeric("bonus_amount", { precision: 14, scale: 2 }).notNull(),
  isElite: boolean("is_elite").notNull().default(false),
  payoutDate: timestamp("payout_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ReferralPayout = typeof referralPayoutsTable.$inferSelect;
