import { useMarketCountdown } from "@/hooks/use-market-countdown";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

interface CountdownBadgeProps {
  market: {
    clockType?: string | null;
    expireAt?: string | null;
    status?: string | null;
  };
  className?: string;
}

/**
 * Shows a live-updating countdown badge for non-EVERGREEN markets.
 * Turns red when under 1 hour. Shows "Recurring monthly" for RECURRING_PULSE.
 * Returns null for EVERGREEN markets or resolved markets.
 */
export function CountdownBadge({ market, className }: CountdownBadgeProps) {
  const countdown = useMarketCountdown(market);

  if (!countdown.label) return null;
  if (market.status === "RESOLVED") return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-mono shrink-0 border",
        countdown.urgent
          ? "bg-red-500/10 text-red-500 border-red-400/40"
          : "bg-background/80 text-muted-foreground border-border/50",
        className
      )}
    >
      {countdown.urgent ? "🔴 " : "⏱ "}
      {countdown.label}
    </Badge>
  );
}
