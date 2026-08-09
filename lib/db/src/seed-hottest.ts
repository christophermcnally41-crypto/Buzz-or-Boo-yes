/**
 * Seeds the HOTTEST IN BOSTON recurring flagship market for the current edition.
 * Run with: pnpm --filter @workspace/db run seed:hottest
 *
 * Safe to run repeatedly:
 * - Never touches RESOLVED editions.
 * - If an OPEN edition already exists (same title + OPEN status), it is left untouched.
 * - Only inserts if no OPEN edition exists.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { marketsTable } from "./schema/markets";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const TITLE = "HOTTEST IN BOSTON";
const PERIOD = "August 2026";

const description = JSON.stringify({
  contenders: [
    { key: "A", name: "Pammy's",      venue: "Cambridge" },
    { key: "B", name: "Sarma",         venue: "Somerville" },
    { key: "C", name: "Giulia",        venue: "Cambridge" },
    { key: "D", name: "Little Donkey", venue: "Cambridge" },
    { key: "E", name: "Bar Mezzana",   venue: "South End" },
  ],
  metric: "Most-predicted hottest restaurant in Boston",
  period: PERIOD,
  recurring: true,
});

async function seed() {
  // Only match OPEN editions — never touch RESOLVED historical markets
  const [openEdition] = await db
    .select()
    .from(marketsTable)
    .where(and(eq(marketsTable.title, TITLE), eq(marketsTable.status, "OPEN")));

  if (openEdition) {
    console.log(`OPEN edition already exists (id=${openEdition.id}, period in desc). Nothing to do.`);
    await pool.end();
    return;
  }

  // No OPEN edition — insert the current one
  const [market] = await db
    .insert(marketsTable)
    .values({
      title: TITLE,
      question: "Which restaurant is HOTTEST IN BOSTON right now?",
      description,
      category: "LOCAL_PULSE",
      subcategory: "Dining",
      marketFormat: "MULTI_CHOICE",
      status: "OPEN",
      resolutionSource: "Platform community vote + admin review",
      closesAt: new Date("2026-08-31T23:59:59Z"),
    })
    .returning();

  console.log(`Inserted HOTTEST IN BOSTON market for ${PERIOD} (id=${market.id})`);
  await pool.end();
  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
