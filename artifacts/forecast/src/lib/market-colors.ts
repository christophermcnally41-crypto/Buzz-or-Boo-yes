/**
 * YES / NO color pairs — all in the robin's egg → deep navy/indigo family.
 * Three subtle variations keep the feed from looking monotone
 * while staying sophisticated and editorial.
 */

export interface MarketColorPair {
  yes: string;
  no: string;
  yesSoft: string;
  noSoft: string;
}

const PAIRS: MarketColorPair[] = [
  // 0 — Robin's egg → deep indigo
  { yes: "#3ECDE8", no: "#2D2580", yesSoft: "#3ECDE825", noSoft: "#2D258025" },
  // 1 — Powder sky → midnight navy
  { yes: "#6DCFE0", no: "#1A1A5E", yesSoft: "#6DCFE025", noSoft: "#1A1A5E25" },
  // 2 — Bright teal-blue → blueberry purple
  { yes: "#22BFD8", no: "#3B1578", yesSoft: "#22BFD825", noSoft: "#3B157825" },
];

export function getMarketColors(marketId: number): MarketColorPair {
  return PAIRS[Math.abs(marketId) % PAIRS.length];
}
