import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { marketsTable } from "./markets";

export const marketPinsTable = pgTable("market_pins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  marketId: integer("market_id").notNull().references(() => marketsTable.id, { onDelete: "cascade" }),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MarketPin = typeof marketPinsTable.$inferSelect;
