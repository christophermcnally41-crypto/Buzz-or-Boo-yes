import { Market } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { cn, formatNumber } from "@/lib/utils";
import { getCategoryLabel, getCategoryIcon } from "@/lib/categories";
import { getMarketColors } from "@/lib/market-colors";
import { HotOrNotCard } from "./hot-or-not-card";
import { HeadToHeadCard } from "./head-to-head-card";

export function MarketCard({ market, featured = false }: { market: Market, featured?: boolean }) {
  // Route to specialised card formats for LOCAL PULSE markets
  if (market.marketFormat === "HOT_OR_NOT") return <HotOrNotCard market={market} />;
  if (market.marketFormat === "HEAD_TO_HEAD") return <HeadToHeadCard market={market} />;

  const isResolved = market.status === "RESOLVED";
  const yesPercent = market.yesPercent || 50;
  const noPercent = market.noPercent || 50;
  const colors = getMarketColors(market.id);
  
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
              {getCategoryIcon(market.category)} {getCategoryLabel(market.category)}
            </Badge>
            {isResolved ? (
              <Badge variant={market.resolvedOutcome === 'YES' ? 'default' : 'destructive'} className="shadow-sm">
                RESOLVED {market.resolvedOutcome}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-background/80 backdrop-blur-sm font-mono-numbers text-[10px] text-muted-foreground border-border/50">
                {formatNumber(market.totalPredictions)} PREDICTIONS
              </Badge>
            )}
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
                <span style={{ color: colors.yes }}>{yesPercent.toFixed(0)}% YES</span>
                <span style={{ color: colors.no }}>{noPercent.toFixed(0)}% NO</span>
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
