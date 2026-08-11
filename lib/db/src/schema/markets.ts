import { pgTable, text, serial, timestamp, integer, real, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketsTable = pgTable("markets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  question: text("question").notNull(),
  description: text("description"),
  category: text("category").notNull(), // STYLE, HOME, CITY, REAL_ESTATE, WEATHER, CULTURE, LOCAL_PULSE
  marketFormat: text("market_format").notNull().default("STANDARD"), // STANDARD, HOT_OR_NOT, HEAD_TO_HEAD, MULTI_CHOICE, BUZZ_OR_BOO, THE_CALL
  subcategory: text("subcategory").notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("OPEN"), // OPEN, CLOSED, RESOLVED, ARCHIVED
  yesCount: integer("yes_count").notNull().default(0),
  noCount: integer("no_count").notNull().default(0),
  totalPredictions: integer("total_predictions").notNull().default(0),
  resolutionSource: text("resolution_source"),
  sourcePrimary: text("source_primary"),
  sourceBackup: text("source_backup"),
  baselineSnapshot: text("baseline_snapshot"),
  formula: text("formula"),
  voidRule: text("void_rule"),
  geo: text("geo"),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedOutcome: text("resolved_outcome"), // YES or NO
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Clock lifecycle fields (Market Bible v0.5 §40)
  clockType: text("clock_type").notNull().default("EVERGREEN"), // EVERGREEN | SEASONAL | NOW | EVENT_DRIVEN | ROLLING_FORECAST | RECURRING_PULSE
  publishAt: timestamp("publish_at", { withTimezone: true }),   // scheduled publish date; null = immediately visible
  peakUntil: timestamp("peak_until", { withTimezone: true }),   // end of peak-freshness window
  expireAt: timestamp("expire_at", { withTimezone: true }),     // hard expiry; null = never expires
  refreshRule: text("refresh_rule"),                            // recurrence cadence for RECURRING_PULSE (e.g. "MONTHLY", "WEEKLY")
  freshnessScore: real("freshness_score"),                      // 0–100, recomputed by the clock worker
  seriesId: integer("series_id"),                               // links recurring editions back to the first market in the series
  templateId: integer("template_id"),                           // FK to market_templates — which franchise mold was used
}, (table) => ({
  // Partial unique index: at most one OPEN market may share a given title at any time.
  // Recurring series deliberately reuse the same title across editions (one per month),
  // so the WHERE clause limits uniqueness enforcement to OPEN rows only.
  // The auto-cycle INSERT uses ON CONFLICT (title) WHERE status='OPEN' DO NOTHING
  // to trigger PostgreSQL's speculative insertion — the only isolation-level-safe
  // way to prevent duplicate successors under concurrent resolve requests.
  openTitleUnique: uniqueIndex("markets_open_title_unique")
    .on(table.title)
    .where(sql`${table.status} = 'OPEN'`),
}));

export const insertMarketSchema = createInsertSchema(marketsTable).omit({ id: true, createdAt: true });
export type InsertMarket = z.infer<typeof insertMarketSchema>;
export type Market = typeof marketsTable.$inferSelect;
