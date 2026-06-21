import { pgTable, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => usersTable.id),
  refereeId: integer("referee_id").notNull().unique().references(() => usersTable.id),
  isActive: boolean("is_active").notNull().default(false),
  depositBonusPaid: boolean("deposit_bonus_paid").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Referral = typeof referralsTable.$inferSelect;
