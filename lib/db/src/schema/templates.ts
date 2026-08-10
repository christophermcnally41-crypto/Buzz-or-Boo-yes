import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * Market Bible v0.5 §42 — Live Franchise Templates
 *
 * Durable question molds with [PLACEHOLDER] slots that admins fill with live
 * subjects to produce ready-to-publish markets. Each template encodes the
 * engine, format, clock behaviour, and default duration so markets are
 * created consistently without free-typing every field from scratch.
 */
export const marketTemplatesTable = pgTable("market_templates", {
  id: serial("id").primaryKey(),
  franchiseName: text("franchise_name").notNull(),           // e.g. "HOTTEST IN BOSTON"
  engine: text("engine").notNull(),                           // market format: MULTI_CHOICE | BUZZ_OR_BOO | THE_CALL | STANDARD | HEAD_TO_HEAD
  templateQuestion: text("template_question").notNull(),      // e.g. "Which spot is HOTTEST IN BOSTON right now: [VENUE A], [VENUE B], or [VENUE C]?"
  clockType: text("clock_type").notNull().default("NOW"),    // default clock lifecycle
  category: text("category").notNull(),                       // STYLE | BEAUTY | CITY | CULTURE | ACCESSORIES | etc.
  defaultDurationDays: integer("default_duration_days").notNull().default(7),
  description: text("description"),                           // optional context shown to admin
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MarketTemplate = typeof marketTemplatesTable.$inferSelect;
export type InsertMarketTemplate = typeof marketTemplatesTable.$inferInsert;
