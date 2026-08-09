import { MarketCategory } from "@workspace/api-client-react";

export function getCategoryLabel(category: MarketCategory | string): string {
  const map: Record<string, string> = {
    STYLE: "Style",
    HOME: "Home",
    CITY: "City",
    REAL_ESTATE: "Property",
    WEATHER: "Weather",
    CULTURE: "Culture",
    LOCAL_PULSE: "Local Pulse",
  };
  return map[category] || category;
}

export function getCategoryIcon(category: MarketCategory | string): string {
  const map: Record<string, string> = {
    STYLE: "👗",
    HOME: "🏠",
    CITY: "🏙",
    REAL_ESTATE: "🏡",
    WEATHER: "🌦",
    CULTURE: "🎭",
    LOCAL_PULSE: "🔥",
  };
  return map[category] || "✨";
}

export const CATEGORIES: (MarketCategory | string)[] = [
  "LOCAL_PULSE",
  "STYLE",
  "HOME",
  "CITY",
  "REAL_ESTATE",
  "WEATHER",
  "CULTURE",
];
