import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  replitId: text("replit_id").unique(),
  username: text("username").notNull().unique(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatarUrl: text("avatar_url"),
  tokenBalance: integer("token_balance").notNull().default(10000),
  totalPredictions: integer("total_predictions").notNull().default(0),
  totalResolved: integer("total_resolved").notNull().default(0),
  totalCorrect: integer("total_correct").notNull().default(0),
  overallAccuracy: real("overall_accuracy"),
  styleAccuracy: real("style_accuracy"),
  homeAccuracy: real("home_accuracy"),
  cityAccuracy: real("city_accuracy"),
  realEstateAccuracy: real("real_estate_accuracy"),
  weatherAccuracy: real("weather_accuracy"),
  cultureAccuracy: real("culture_accuracy"),
  rank: integer("rank"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
