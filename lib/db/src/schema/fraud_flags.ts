import { pgTable, serial, integer, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transactionsTable } from "./transactions";

export const fraudSeverityEnum = pgEnum("fraud_severity", ["low", "medium", "high"]);

export const fraudFlagsTable = pgTable("fraud_flags", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id),
  reason: text("reason").notNull(),
  severity: fraudSeverityEnum("severity").notNull().default("low"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFraudFlagSchema = createInsertSchema(fraudFlagsTable).omit({ id: true, createdAt: true });
export type InsertFraudFlag = z.infer<typeof insertFraudFlagSchema>;
export type FraudFlag = typeof fraudFlagsTable.$inferSelect;
