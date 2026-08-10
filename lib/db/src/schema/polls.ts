import { pgTable, text, serial, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";

export interface PollOption {
  key: string;
  label: string;
  emoji?: string;
}

export const pollsTable = pgTable("polls", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  description: text("description"),
  options: jsonb("options").notNull().$type<PollOption[]>(),
  status: text("status").notNull().default("OPEN"), // OPEN, CLOSED, CONVERTED
  closesAt: timestamp("closes_at", { withTimezone: true }),
  generatedMarketId: integer("generated_market_id"), // FK to markets if converted
  isRising: boolean("is_rising").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollVotesTable = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => pollsTable.id),
  optionKey: text("option_key").notNull(),
  fingerprint: text("fingerprint"), // browser fingerprint for light dedup
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Poll = typeof pollsTable.$inferSelect;
export type PollVote = typeof pollVotesTable.$inferSelect;
