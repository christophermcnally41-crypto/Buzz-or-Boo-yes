import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { getMarketColors } from "@/lib/market-colors";
import { useMemo } from "react";
import { getTallyRefetchInterval } from "@/lib/tally-poll";

const BUZZ_COLOR = "#CFEA3B";
const BOO_COLOR = "#E8503E";

export function BuzzOrBooCard({ market }: { market: Market }) {
  const colors = getMarketColors(market.id);
  const buzzColor = BUZZ_COLOR;
  const booColor = BOO_COLOR;

  const isResolved = market.status === "RESOLVED";

  // Poll for live tallies every 30 s while the market is OPEN; stops automatically when it resolves/closes.
  const { data: tallyData } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: getTallyRefetchInterval(market.status),
    },
  });

  // Derive live percentages from tally data; fall back to market props when tally is not yet loaded
  const { buzzPercent, booPercent } = useMemo(() => {
    const yes = tallyData?.tallies?.["YES"] ?? 0;
    const no = tallyData?.tallies?.["NO"] ?? 0;
    const total = yes + no;
    if (total > 0) {
      return {
        buzzPercent: (yes / total) * 100,
        booPercent: (no / total) * 100,
      };
    }
    return {
      buzzPercent: market.yesPercent ?? 50,
      booPercent: market.noPercent ?? 50,
    };
  }, [tallyData, market.yesPercent, market.noPercent]);

  // Determine dominant sentiment
  const dominantBuzz = buzzPercent >= booPercent;

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <Badge
              variant="secondary"
              className="text-xs font-bold tracking-wider"
              style={{ backgroundColor: dominantBuzz ? `${BUZZ_COLOR}22` : `${BOO_COLOR}22`, color: dominantBuzz ? BUZZ_COLOR : BOO_COLOR, border: `1px solid ${dominantBuzz ? BUZZ_COLOR : BOO_COLOR}44` }}
            >
              {dominantBuzz ? "⚡ BUZZING" : "👎 BOO'D"}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50 shrink-0">
              {formatNumber(market.totalPredictions)} VERDICTS
            </Badge>
          </div>

          {/* Format label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">⚡ Buzz or Boo</span>
          </div>

          {/* Subject — big, editorial */}
          <h3 className="font-editorial text-2xl font-bold leading-tight group-hover:text-primary transition-colors">
            {market.title}
          </h3>
          {market.question !== market.title && (
            <p className="text-sm text-muted-foreground mt-1 leading-snug">{market.question}</p>
          )}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-3">
          {/* Sentiment split bar */}
          <div className="space-y-2 pt-3 border-t border-border/30">
            <div className="flex justify-between text-sm font-bold font-mono-numbers">
              <span style={{ color: buzzColor }}>⚡ {buzzPercent.toFixed(0)}% BUZZ</span>
              <span style={{ color: booColor }}>👎 {booPercent.toFixed(0)}% BOO</span>
            </div>
            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
              <div
                className="h-full transition-all duration-1000 ease-out rounded-l-full"
                style={{ width: `${buzzPercent}%`, backgroundColor: buzzColor }}
              />
              <div
                className="h-full transition-all duration-1000 ease-out rounded-r-full"
                style={{ width: `${booPercent}%`, backgroundColor: booColor }}
              />
            </div>

            {isResolved && (
              <div className="text-xs text-center text-muted-foreground font-medium">
                Sentiment snapshot — {market.resolvedAt ? new Date(market.resolvedAt).toLocaleDateString() : "Closed"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
