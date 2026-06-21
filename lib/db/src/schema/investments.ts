import { pgTable, serial, integer, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { plansTable } from "./plans";

export const investmentStatusEnum = pgEnum("investment_status", ["active", "completed", "cancelled"]);

export const investmentsTable = pgTable("investments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  planId: integer("plan_id").notNull().references(() => plansTable.id),
  amountInvested: numeric("amount_invested", { precision: 14, scale: 2 }).notNull(),
  dailyEarning: numeric("daily_earning", { precision: 14, scale: 2 }).notNull(),
  totalEarned: numeric("total_earned", { precision: 14, scale: 2 }).notNull().default("0"),
  expectedTotal: numeric("expected_total", { precision: 14, scale: 2 }).notNull(),
  status: investmentStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completesAt: timestamp("completes_at"),
  lastEarningAt: timestamp("last_earning_at"),
});

export const insertInvestmentSchema = createInsertSchema(investmentsTable).omit({ id: true });
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investmentsTable.$inferSelect;
