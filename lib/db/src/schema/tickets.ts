import { pgTable, serial, text, timestamp, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ticketTypeEnum = pgEnum("ticket_type", [
  "deposit",
  "withdrawal",
  "investment",
  "ban",
  "appeal",
  "dormancy",
  "otp",
]);

export const ticketStatusEnum = pgEnum("ticket_status", ["open", "resolved", "closed"]);

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").unique(),
  type: ticketTypeEnum("type").notNull(),
  userId: integer("user_id").references(() => usersTable.id),
  relatedId: integer("related_id"),
  status: ticketStatusEnum("status").notNull().default("open"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Ticket = typeof ticketsTable.$inferSelect;
