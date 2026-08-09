/**
 * Each market gets a unique YES / NO color pair based on its ID.
 * Colors rotate through the palette so every question feels distinct.
 */

export interface MarketColorPair {
  yes: string;
  no: string;
  yesSoft: string; // translucent tint for backgrounds / glows
  noSoft: string;
}

const PAIRS: MarketColorPair[] = [
  // 0 — Cobalt → Seafoam
  { yes: "#1D6FE8", no: "#0D9488", yesSoft: "#1D6FE820", noSoft: "#0D948820" },
  // 1 — Crimson → Blush pink
  { yes: "#C41230", no: "#E879A0", yesSoft: "#C4123020", noSoft: "#E879A020" },
  // 2 — Egg yolk → Pale gold
  { yes: "#C98C00", no: "#F0C94D", yesSoft: "#C98C0020", noSoft: "#F0C94D20" },
  // 3 — Blueberry → Amber
  { yes: "#4338CA", no: "#D97706", yesSoft: "#4338CA20", noSoft: "#D9770620" },
  // 4 — Evergreen → Mint
  { yes: "#166534", no: "#34D399", yesSoft: "#16653420", noSoft: "#34D39920" },
  // 5 — Terracotta → Dusty rose
  { yes: "#C2410C", no: "#F9A8D4", yesSoft: "#C2410C20", noSoft: "#F9A8D420" },
  // 6 — Plum → Peach
  { yes: "#7C3AED", no: "#FB923C", yesSoft: "#7C3AED20", noSoft: "#FB923C20" },
  // 7 — Midnight slate → Electric lime
  { yes: "#334155", no: "#84CC16", yesSoft: "#33415520", noSoft: "#84CC1620" },
  // 8 — Teal → Lavender
  { yes: "#0891B2", no: "#A78BFA", yesSoft: "#0891B220", noSoft: "#A78BFA20" },
  // 9 — Forest → Coral
  { yes: "#15803D", no: "#F87171", yesSoft: "#15803D20", noSoft: "#F8717120" },
];

export function getMarketColors(marketId: number): MarketColorPair {
  return PAIRS[Math.abs(marketId) % PAIRS.length];
}
