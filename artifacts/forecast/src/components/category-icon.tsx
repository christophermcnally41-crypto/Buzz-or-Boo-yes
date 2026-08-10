import { Shirt, Home, Building2, Landmark, CloudSun, Palette, Flame, Sparkles, Wand2, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

const GOLD = "hsl(43 72% 48%)";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  STYLE: Shirt,
  HOME: Home,
  CITY: Building2,
  REAL_ESTATE: Landmark,
  WEATHER: CloudSun,
  CULTURE: Palette,
  LOCAL_PULSE: Flame,
  BEAUTY: Wand2,
  ACCESSORIES: ShoppingBag,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const Icon = ICON_MAP[category] ?? Sparkles;
  return <Icon className={cn("inline-block shrink-0", className)} style={{ color: GOLD }} />;
}
