import { MarketCategory } from "@workspace/api-client-react";

export function getCategoryLabel(category: MarketCategory | string): string {
  const map: Record<string, string> = {
    STYLE: "Style",
    HOME: "Home",
    CITY: "City",
    REAL_ESTATE: "Property",
    WEATHER: "Weather",
    CULTURE: "Culture",
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
  };
  return map[category] || "✨";
}

export const CATEGORIES: MarketCategory[] = [
  "STYLE",
  "HOME",
  "CITY",
  "REAL_ESTATE",
  "WEATHER",
  "CULTURE"
];
