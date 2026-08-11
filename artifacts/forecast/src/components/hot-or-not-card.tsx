import { Market } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { cn, formatNumber } from "@/lib/utils";
import { CategoryIcon } from "@/components/category-icon";
import { getMarketColors } from "@/lib/market-colors";
import { CountdownBadge } from "./countdown-badge";

interface HotOrNotData {
  entity: string;
  currentRating?: number | null;
  targetRating?: number;
  targetReviews?: number;
  metric: string;
  address?: string;
  note?: string;
}

function parseHotOrNotData(description: string | null | undefined): HotOrNotData | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    if (parsed.entity) return parsed as HotOrNotData;
    return null;
  } catch {
    return null;
  }
}

export function HotOrNotCard({ market }: { market: Market }) {
  const data = parseHotOrNotData(market.description);
  const colors = getMarketColors(market.id);
  const yesPercent = market.yesPercent || 50;
  const noPercent = market.noPercent || 50;
  const isResolved = market.status === "RESOLVED";

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
              🔥 Local Pulse
            </Badge>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <CountdownBadge market={market as any} />
              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
                {formatNumber(market.totalPredictions)} PREDICTIONS
              </Badge>
            </div>
          </div>

          {/* Format label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">⭐ Hot or Not</span>
          </div>

          {/* Entity name — big and editorial */}
          {data ? (
            <div>
              <h3 className="font-editorial text-2xl font-bold leading-tight group-hover:text-primary transition-colors mb-1">
                {data.entity}
              </h3>
              {data.address && (
                <p className="text-xs text-muted-foreground truncate">{data.address}</p>
              )}
            </div>
          ) : (
            <h3 className="font-editorial text-xl font-bold leading-tight group-hover:text-primary transition-colors">
              {market.question}
            </h3>
          )}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-4">
          {/* Rating display */}
          {data && (data.currentRating != null || data.targetRating) && (
            <div className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-3">
              {data.currentRating != null && (
                <div className="text-center">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Now</div>
                  <div className="text-2xl font-editorial font-bold">⭐ {data.currentRating.toFixed(1)}</div>
                </div>
              )}
              {data.currentRating != null && data.targetRating && (
                <div className="text-muted-foreground/40 font-editorial text-xl">→</div>
              )}
              {data.targetRating && (
                <div className="text-center">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Target</div>
                  <div className="text-2xl font-editorial font-bold" style={{ color: colors.yes }}>
                    ⭐ {data.targetRating.toFixed(1)}
                  </div>
                </div>
              )}
              {data.targetReviews && (
                <div className="text-center w-full">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Target</div>
                  <div className="text-2xl font-editorial font-bold" style={{ color: colors.yes }}>
                    {formatNumber(data.targetReviews)} reviews
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Question */}
          <p className={cn(
            "text-sm text-muted-foreground leading-snug",
            data ? "" : "hidden"
          )}>
            {market.question}
          </p>

          {/* YES / NO bar */}
          {!isResolved ? (
            <div className="space-y-2 pt-1 border-t border-border/30">
              <div className="flex justify-between text-sm font-bold font-mono-numbers">
                <span style={{ color: colors.yes }}>{yesPercent.toFixed(0)}% YES</span>
                <span style={{ color: colors.no }}>{noPercent.toFixed(0)}% NO</span>
              </div>
              <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden flex">
                <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${yesPercent}%`, backgroundColor: colors.yes }} />
                <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${noPercent}%`, backgroundColor: colors.no }} />
              </div>
            </div>
          ) : (
            <div className="pt-1 border-t border-border/30 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Result</span>
              <span className="font-bold font-mono-numbers" style={{ color: market.resolvedOutcome === 'YES' ? colors.yes : colors.no }}>
                {market.resolvedOutcome}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
