import { useMarketCountdown } from "@/hooks/use-market-countdown";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

interface CountdownBadgeProps {
  market: {
    clockType?: string | null;
    expireAt?: string | null;
    status?: string | null;
    scheduledFor?: string | null;
  };
  className?: string;
}

/**
 * Shows a live-updating countdown badge for non-EVERGREEN markets.
 * Turns red when under 1 hour. Shows "Recurring monthly" for RECURRING_PULSE.
 * Returns null for EVERGREEN markets or resolved markets.
 * Shows a "🗓 Scheduled" badge for SCHEDULED markets.
 */
export function CountdownBadge({ market, className }: CountdownBadgeProps) {
  const countdown = useMarketCountdown(market);

  if (market.status === "RESOLVED" || market.status === "CLOSED") return null;

  // Scheduled markets get a distinct amber badge with the open date when available
  if (market.status === "SCHEDULED") {
    const openLabel = (market as any).scheduledFor
      ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : (countdown.label ?? "Scheduled");
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] font-mono shrink-0 border text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/8",
          className
        )}
      >
        🗓 {openLabel}
      </Badge>
    );
  }

  if (!countdown.label) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-mono shrink-0 border",
        countdown.urgent
          ? "bg-red-500/10 text-red-500 border-red-400/40 animate-pulse"
          : "bg-background/80 text-muted-foreground border-border/50",
        className
      )}
    >
      {countdown.urgent ? "🔴 " : "⏱ "}
      {countdown.label}
    </Badge>
  );
}
