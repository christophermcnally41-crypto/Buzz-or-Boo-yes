/**
 * Seed script: Market Bible v0.5 §42 — Live Franchise Templates
 * Run with: pnpm --filter @workspace/db exec tsx src/seed-templates.ts
 *
 * Seeds the 10 core franchise templates. Safe to re-run (uses ON CONFLICT DO NOTHING).
 */
import { db, marketTemplatesTable } from "./index.js";
import { sql } from "drizzle-orm";

const TEMPLATES = [
  {
    franchiseName: "HOTTEST IN BOSTON",
    engine: "MULTI_CHOICE",
    templateQuestion: "Which spot is HOTTEST IN BOSTON right now: [VENUE A], [VENUE B], or [VENUE C]?",
    clockType: "NOW",
    category: "CITY",
    defaultDurationDays: 7,
    description: "The flagship venue battle. Fill in 3–5 competing spots — restaurants, bars, pop-ups, boutiques. Winner takes the crown for the week.",
  },
  {
    franchiseName: "BEAUTY BATTLE",
    engine: "HEAD_TO_HEAD",
    templateQuestion: "Beauty Battle: [BRAND A] vs [BRAND B] — which one actually delivers?",
    clockType: "NOW",
    category: "BEAUTY",
    defaultDurationDays: 5,
    description: "Two beauty brands go head-to-head. Fill in any two competing products, collections, or brands. The crowd votes with their wallets.",
  },
  {
    franchiseName: "THE IT BAG",
    engine: "MULTI_CHOICE",
    templateQuestion: "What's the IT BAG of [SEASON/MOMENT]? [BAG A], [BAG B], or [BAG C]?",
    clockType: "SEASONAL",
    category: "ACCESSORIES",
    defaultDurationDays: 14,
    description: "The crowd declares the season's must-have bag. Fill in 3–5 current contenders from any tier.",
  },
  {
    franchiseName: "COLOR CALL",
    engine: "THE_CALL",
    templateQuestion: "Color Call: What's the breakout color of [SEASON]?",
    clockType: "SEASONAL",
    category: "STYLE",
    defaultDurationDays: 14,
    description: "The crowd predicts the season's breakout color. Add 4–6 color options as The Call choices.",
  },
  {
    franchiseName: "BUZZ BATTLE",
    engine: "MULTI_CHOICE",
    templateQuestion: "Buzz Battle [CATEGORY]: [NAME A] vs [NAME B] vs [NAME C] — who's winning the moment?",
    clockType: "NOW",
    category: "CULTURE",
    defaultDurationDays: 5,
    description: "Who's winning the cultural moment? Fill in any competing names — designers, influencers, brands, artists.",
  },
  {
    franchiseName: "STAR WATCH",
    engine: "BUZZ_OR_BOO",
    templateQuestion: "Star Watch: Is [PERSON]'s moment here? BUZZ or BOO?",
    clockType: "NOW",
    category: "CULTURE",
    defaultDurationDays: 3,
    description: "One-tap crowd verdict on whether a person's cultural star is rising or fading.",
  },
  {
    franchiseName: "STILL BUZZ?",
    engine: "BUZZ_OR_BOO",
    templateQuestion: "Still Buzz? Is [TREND/PERSON/BRAND] still having a moment — or is the vibe over?",
    clockType: "NOW",
    category: "CULTURE",
    defaultDurationDays: 3,
    description: "Quick crowd check on whether a trend or name still has cultural currency. BUZZ = still hot, BOO = peaked.",
  },
  {
    franchiseName: "COMEBACK OR BOO?",
    engine: "BUZZ_OR_BOO",
    templateQuestion: "Comeback or Boo? Is [TREND/PERSON/BRAND] actually making a real comeback — or just nostalgia bait?",
    clockType: "NOW",
    category: "CULTURE",
    defaultDurationDays: 5,
    description: "Crowd verdict on whether a comeback is real or manufactured. Perfect for fashion cycles, artist revivals, brand relaunches.",
  },
  {
    franchiseName: "WORTH THE SPLURGE?",
    engine: "BUZZ_OR_BOO",
    templateQuestion: "Worth the Splurge? Is [PRODUCT] actually worth the price — or just clout?",
    clockType: "NOW",
    category: "STYLE",
    defaultDurationDays: 5,
    description: "Crowd validation on whether a luxury or hyped product justifies its price tag.",
  },
  {
    franchiseName: "THE REPURCHASE",
    engine: "BUZZ_OR_BOO",
    templateQuestion: "The Repurchase: Would you buy [PRODUCT] again — BUZZ (yes) or BOO (hard pass)?",
    clockType: "NOW",
    category: "BEAUTY",
    defaultDurationDays: 5,
    description: "The ultimate loyalty test — would the crowd actually buy this again? Applies to beauty, food, fashion, or any consumer product.",
  },
];

async function main() {
  console.log("Seeding franchise templates...");

  for (const template of TEMPLATES) {
    // Insert if franchise_name doesn't already exist
    await db.execute(sql`
      INSERT INTO market_templates (franchise_name, engine, template_question, clock_type, category, default_duration_days, description)
      VALUES (
        ${template.franchiseName},
        ${template.engine},
        ${template.templateQuestion},
        ${template.clockType},
        ${template.category},
        ${template.defaultDurationDays},
        ${template.description}
      )
      ON CONFLICT DO NOTHING
    `);
    console.log(`  ✓ ${template.franchiseName}`);
  }

  console.log("Done! Seeded franchise templates.");
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
