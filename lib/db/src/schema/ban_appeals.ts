import { pgTable, serial, integer, text, timestamp, pgEnum, type AnyPgColumn } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const appealStatusEnum = pgEnum("appeal_status", ["pending", "approved", "rejected"]);

export const banAppealsTable = pgTable("ban_appeals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  message: text("message").notNull(),
  status: appealStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  resolvedById: integer("resolved_by_id").references((): AnyPgColumn => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export type BanAppeal = typeof banAppealsTable.$inferSelect;
