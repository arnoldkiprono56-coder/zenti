import { pgTable, serial, text, timestamp, numeric, boolean, pgEnum, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "superadmin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "banned", "dormant"]);
export const referralStatusEnum = pgEnum("referral_status", ["none", "countdown", "elite", "standard"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  status: userStatusEnum("status").notNull().default("active"),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  lockedBalance: numeric("locked_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  totalEarned: numeric("total_earned", { precision: 14, scale: 2 }).notNull().default("0"),
  isInternshipEligible: boolean("is_internship_eligible").notNull().default(false),
  internshipActivated: boolean("internship_activated").notNull().default(false),
  adminNotes: text("admin_notes"),
  referralCode: text("referral_code").unique(),
  referredById: integer("referred_by_id").references((): AnyPgColumn => usersTable.id),
  referralStatus: referralStatusEnum("referral_status").notNull().default("none"),
  referralCountdownDeadline: timestamp("referral_countdown_deadline"),
  isVerified: boolean("is_verified").notNull().default(false),
  googleId: text("google_id"),
  registrationIp: text("registration_ip"),
  deviceFingerprint: text("device_fingerprint"),
  registrationCountry: text("registration_country"),
  lastLoginIp: text("last_login_ip"),
  lastLoginAt: timestamp("last_login_at"),
  lastLoginCountry: text("last_login_country"),
  bannedReason: text("banned_reason"),
  bannedAt: timestamp("banned_at"),
  dormancyStartedAt: timestamp("dormancy_started_at"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
