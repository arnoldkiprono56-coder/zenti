import { pgTable, serial, text, boolean, date, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  supportEmail: text("support_email").notNull().default("support@investke.co.ke"),
  contactPhone: text("contact_phone").notNull().default("+254700000000"),
  companyName: text("company_name").notNull().default("InvestKE Ltd"),
  companyAddress: text("company_address").notNull().default("Nairobi, Kenya"),
  termsOfService: text("terms_of_service"),
  privacyPolicy: text("privacy_policy"),
  aboutUs: text("about_us"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  internshipActiveFrom: date("internship_active_from"),
  internshipActiveTo: date("internship_active_to"),
  verificationMethod: text("verification_method").notNull().default("auto"),
  smtpHost: text("smtp_host").notNull().default("smtp.gmail.com"),
  smtpPort: text("smtp_port").notNull().default("587"),
  smtpFromEmail: text("smtp_from_email").notNull().default(""),
  smtpFromName: text("smtp_from_name").notNull().default("Zenti"),
  withdrawalFeePercent: numeric("withdrawal_fee_percent", { precision: 5, scale: 2 }).notNull().default("10"),
  dailyWithdrawalLimitKES: numeric("daily_withdrawal_limit_kes", { precision: 14, scale: 2 }).notNull().default("50000"),
  maxActiveInvestments: integer("max_active_investments").notNull().default(5),
  withdrawalCooldownHours: integer("withdrawal_cooldown_hours").notNull().default(24),
  minDepositHoldingHours: integer("min_deposit_holding_hours").notNull().default(24),
  maintenanceBannerMessage: text("maintenance_banner_message").notNull().default("We are performing scheduled maintenance. We'll be back shortly."),
  maintenanceEta: text("maintenance_eta"),
  configKeys: jsonb("config_keys").$type<Record<string, string>>().notNull().default({}),
  payheroAuthToken: text("payhero_auth_token"),
  payheroChannelId: text("payhero_channel_id"),
});

export const insertPlatformSettingsSchema = createInsertSchema(platformSettingsTable).omit({ id: true });
export type InsertPlatformSettings = z.infer<typeof insertPlatformSettingsSchema>;
export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
