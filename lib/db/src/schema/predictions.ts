import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { marketsTable } from "./markets";

export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  marketId: integer("market_id").notNull().references(() => marketsTable.id),
  choice: text("choice").notNull(), // YES or NO for standard markets; contender key (A–E) for MULTI_CHOICE markets
  amount: integer("amount").notNull().default(100),
  isCorrect: boolean("is_correct"),
  tokensEarned: integer("tokens_earned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("predictions_user_market_unique").on(table.userId, table.marketId),
]);

export const insertPredictionSchema = createInsertSchema(predictionsTable).omit({ id: true, createdAt: true });
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictionsTable.$inferSelect;
