/**
 * YES / NO color pairs — ported from artifacts/forecast/src/lib/market-colors.ts
 * Robin's egg → deep navy/indigo family.
 */

export interface MarketColorPair {
  yes: string;
  no: string;
  yesAlpha: string;
  noAlpha: string;
}

const PAIRS: MarketColorPair[] = [
  { yes: '#3ECDE8', no: '#2D2580', yesAlpha: '#3ECDE820', noAlpha: '#2D258020' },
  { yes: '#6DCFE0', no: '#1A1A5E', yesAlpha: '#6DCFE020', noAlpha: '#1A1A5E20' },
  { yes: '#22BFD8', no: '#3B1578', yesAlpha: '#22BFD820', noAlpha: '#3B157820' },
];

export function getMarketColors(marketId: number): MarketColorPair {
  return PAIRS[Math.abs(marketId) % PAIRS.length];
}
