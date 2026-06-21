import { pgTable, serial, integer, timestamp, numeric, text, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const transactionTypeEnum = pgEnum("transaction_type", ["deposit", "withdrawal", "earning"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "failed", "rejected"]);
export const withdrawalMethodEnum = pgEnum("withdrawal_method", ["mpesa", "airtel_money", "bank"]);

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 14, scale: 2 }).notNull().default("0"),
  status: transactionStatusEnum("status").notNull().default("pending"),
  method: withdrawalMethodEnum("method"),
  phoneOrAccount: text("phone_or_account"),
  reference: text("reference"),
  isFlagged: boolean("is_flagged").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
