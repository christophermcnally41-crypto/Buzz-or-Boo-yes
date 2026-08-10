import { Market } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { cn, formatNumber } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { getMarketColors } from "@/lib/market-colors";
import { HotOrNotCard } from "./hot-or-not-card";
import { HeadToHeadCard } from "./head-to-head-card";
import { MultiChoiceCard } from "./multi-choice-card";
import { BuzzOrBooCard } from "./buzz-or-boo-card";
import { TheCallCard } from "./the-call-card";

/** Returns a human-readable freshness label for non-EVERGREEN markets. */
function getFreshnessLabel(market: Market): string | null {
  const clockType = (market as any).clockType as string | undefined;
  const expireAt = (market as any).expireAt as string | null | undefined;
  if (!clockType || clockType === "EVERGREEN" || !expireAt) return null;

  const now = Date.now();
  const expiry = new Date(expireAt).getTime();
  const msLeft = expiry - now;
  if (msLeft <= 0) return null;

  const hoursLeft = msLeft / (1000 * 60 * 60);
  if (hoursLeft < 1) return "Expires in < 1 hr";
  if (hoursLeft < 24) return `Expires in ${Math.ceil(hoursLeft)}h`;
  const daysLeft = Math.ceil(hoursLeft / 24);
  if (daysLeft === 1) return "Expires tomorrow";
  return `Expires in ${daysLeft} days`;
}

const CLOCK_BADGE_STYLES: Record<string, string> = {
  NOW:              "bg-red-500/10 text-red-600 border-red-200",
  SEASONAL:         "bg-amber-500/10 text-amber-700 border-amber-200",
  EVENT_DRIVEN:     "bg-blue-500/10 text-blue-700 border-blue-200",
  ROLLING_FORECAST: "bg-purple-500/10 text-purple-700 border-purple-200",
  RECURRING_PULSE:  "bg-emerald-500/10 text-emerald-700 border-emerald-200",
};

export function MarketCard({ market, featured = false }: { market: Market, featured?: boolean }) {
  // Route to specialised card formats
  if (market.marketFormat === "HOT_OR_NOT") return <HotOrNotCard market={market} />;
  if (market.marketFormat === "HEAD_TO_HEAD") return <HeadToHeadCard market={market} />;
  if (market.marketFormat === "MULTI_CHOICE") return <MultiChoiceCard market={market} />;
  if (market.marketFormat === "BUZZ_OR_BOO") return <BuzzOrBooCard market={market} />;
  if (market.marketFormat === "THE_CALL") return <TheCallCard market={market} />;

  const isResolved = market.status === "RESOLVED";
  const yesPercent = market.yesPercent || 50;
  const noPercent = market.noPercent || 50;
  const colors = getMarketColors(market.id);
  const clockType = (market as any).clockType as string | undefined;
  const freshnessLabel = getFreshnessLabel(market);
  const clockBadgeStyle = clockType ? CLOCK_BADGE_STYLES[clockType] : undefined;
  
  return (
    <Link href={`/markets/${market.id}`}>
      <Card className={cn(
        "group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col relative overflow-hidden border-border/50 hover:border-primary/30",
        featured ? "md:col-span-2 md:row-span-2" : ""
      )}>
        {/* Background Image / Gradient */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br from-muted/50 to-background z-0",
          market.imageUrl ? "" : "opacity-100"
        )} />
        {market.imageUrl && (
          <div className="absolute inset-0 z-0">
            <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          </div>
        )}

        <CardHeader className="relative z-10 pb-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm border-border/50 text-xs gap-1.5 font-medium">
              <CategoryIcon category={market.category} className="w-3.5 h-3.5" />
              {getCategoryLabel(market.category)}
              {market.subcategory && (
                <span className="text-muted-foreground/60">· {market.subcategory}</span>
              )}
            </Badge>
            {isResolved ? (
              <Badge variant={market.resolvedOutcome === 'YES' ? 'default' : 'destructive'} className="shadow-sm">
                RESOLVED {market.resolvedOutcome === 'YES' ? 'BUZZ' : 'BOO'}
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {freshnessLabel && clockBadgeStyle && (
                  <Badge variant="outline" className={cn("font-mono-numbers text-[10px] border", clockBadgeStyle)}>
                    {freshnessLabel}
                  </Badge>
                )}
                {clockType === "RECURRING_PULSE" && (
                  <Badge variant="outline" className="text-[10px] border border-emerald-200 text-emerald-700 bg-emerald-500/10">
                    🔁 Recurring
                  </Badge>
                )}
                <Badge variant="outline" className="bg-background/80 backdrop-blur-sm font-mono-numbers text-[10px] text-muted-foreground border-border/50">
                  {formatNumber(market.totalPredictions)} CALLS
                </Badge>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">📊 Forecast</span>
          </div>
          
          <h3 className={cn(
            "font-editorial font-semibold text-balance leading-tight group-hover:text-primary transition-colors",
            featured ? "text-2xl md:text-4xl" : "text-xl"
          )}>
            {market.question}
          </h3>
        </CardHeader>
        
        <CardContent className="relative z-10 mt-auto pt-4 border-t border-border/30">
          {!isResolved ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-bold font-mono-numbers">
                <span style={{ color: colors.yes }}>{yesPercent.toFixed(0)}% BUZZ</span>
                <span style={{ color: colors.no }}>{noPercent.toFixed(0)}% BOO</span>
              </div>
              <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
                <div
                  className="h-full transition-all duration-1000 ease-out"
                  style={{ width: `${yesPercent}%`, backgroundColor: colors.yes }}
                />
                <div
                  className="h-full transition-all duration-1000 ease-out"
                  style={{ width: `${noPercent}%`, backgroundColor: colors.no }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm text-muted-foreground font-medium">
              <span>Final Result:</span>
              <span
                className="font-bold font-mono-numbers text-lg"
                style={{ color: market.resolvedOutcome === 'YES' ? colors.yes : colors.no }}
              >
                {market.resolvedOutcome}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
