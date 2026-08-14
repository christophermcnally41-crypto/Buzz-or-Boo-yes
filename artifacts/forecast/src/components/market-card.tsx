import { useMemo } from "react";
import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
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
import { CountdownBadge } from "./countdown-badge";
import { getTallyRefetchInterval } from "@/lib/tally-poll";

export function MarketCard({ market, featured = false }: { market: Market, featured?: boolean }) {
  // Route to specialised card formats
  if (market.marketFormat === "HOT_OR_NOT") return <HotOrNotCard market={market} featured={featured} />;
  if (market.marketFormat === "HEAD_TO_HEAD") return <HeadToHeadCard market={market} featured={featured} />;
  if (market.marketFormat === "MULTI_CHOICE") return <MultiChoiceCard market={market} featured={featured} />;
  if (market.marketFormat === "BUZZ_OR_BOO") return <BuzzOrBooCard market={market} featured={featured} />;
  if (market.marketFormat === "THE_CALL") return <TheCallCard market={market} featured={featured} />;

  return <StandardMarketCard market={market} featured={featured} />;
}

// Separate component so hooks are only called for STANDARD markets
function StandardMarketCard({ market, featured }: { market: Market; featured: boolean }) {
  const isResolved = market.status === "RESOLVED";
  const isScheduled = market.status === "SCHEDULED";
  const isClosed = market.status === "CLOSED";
  const colors = getMarketColors(market.id);

  // Live tally polling — same pattern as BuzzOrBooCard
  const { data: tally } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: getTallyRefetchInterval(market.status),
    },
  });

  const { yesPercent, noPercent } = useMemo(() => {
    const map = (tally?.tallies ?? {}) as Record<string, number>;
    const yes = map['YES'] ?? 0;
    const no = map['NO'] ?? 0;
    const total = yes + no;
    if (total > 0) {
      return {
        yesPercent: (yes / total) * 100,
        noPercent: (no / total) * 100,
      };
    }
    return {
      yesPercent: market.yesPercent ?? 50,
      noPercent: market.noPercent ?? 50,
    };
  }, [tally, market.yesPercent, market.noPercent]);

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
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Badge variant={market.resolvedOutcome === 'YES' ? 'default' : 'secondary'} className="shadow-sm">
                  {market.resolvedOutcome === 'YES' ? '✓ YES' : market.resolvedOutcome === 'NO' ? '✗ NO' : market.resolvedOutcome ? `✓ ${market.resolvedOutcome}` : '🔒 Resolved'}
                </Badge>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold">
                  🔒 Resolved
                </Badge>
                {market.totalPredictions > 0 && (
                  <Badge variant="outline" className="bg-background/80 backdrop-blur-sm font-mono-numbers text-[10px] text-muted-foreground border-border/50">
                    {formatNumber(market.totalPredictions)} CALLS
                  </Badge>
                )}
              </div>
            ) : isClosed ? (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border/50 text-[10px] font-bold">
                  🔒 Closed
                </Badge>
                {market.totalPredictions > 0 && (
                  <Badge variant="outline" className="bg-background/80 backdrop-blur-sm font-mono-numbers text-[10px] text-muted-foreground border-border/50">
                    {formatNumber(market.totalPredictions)} CALLS
                  </Badge>
                )}
              </div>
            ) : isScheduled ? (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/8 text-[10px] font-mono">
                🗓 {(market as any).scheduledFor
                  ? `Opens ${new Date((market as any).scheduledFor).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                  : 'Coming Soon'}
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <CountdownBadge market={market as any} />
                <Badge variant="outline" className="bg-background/80 backdrop-blur-sm font-mono-numbers text-[10px] text-muted-foreground border-border/50">
                  {formatNumber(market.totalPredictions)} {market.totalPredictions === 1 ? 'CALL' : 'CALLS'}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">📊 Forecast</span>
            {!isResolved && !isClosed && !isScheduled && market.closesAt && (
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase">
                · RESOLVES {new Date(market.closesAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          
          <h3 className={cn(
            "font-editorial font-semibold text-balance leading-tight group-hover:text-primary transition-colors",
            featured ? "text-2xl md:text-4xl" : "text-xl"
          )}>
            {market.question}
          </h3>
          {(market as any).whyNow && !isResolved && !isClosed && (
            <p className="text-[11px] text-amber-500/80 font-medium mt-1.5">
              ⚡ WHY NOW — {(market as any).whyNow}
            </p>
          )}
        </CardHeader>
        
        <CardContent className="relative z-10 mt-auto pt-4 border-t border-border/30">
          {isScheduled ? (
            <p className="text-xs text-muted-foreground text-center py-1">
              {(market as any).scheduledFor
                ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${new Date((market as any).scheduledFor).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — check back to predict`
                : 'Opens soon — check back to predict'}
            </p>
          ) : !isResolved ? (
          (() => {
            const map = (tally?.tallies ?? {}) as Record<string, number>;
            const yes = map['YES'] ?? 0;
            const no = map['NO'] ?? 0;
            const liveTotal = yes + no;
            if (liveTotal === 0 && !tally) {
              // Tally not yet loaded — show skeleton bar if we have stored percentages, otherwise empty state
              const storedYes = market.yesPercent ?? 0;
              const storedNo = market.noPercent ?? 0;
              const hasStoredData = storedYes > 0 || storedNo > 0;
              if (!hasStoredData) {
                return <p className="text-xs text-muted-foreground/70 text-center py-1 italic">No predictions yet — be the first to call it</p>;
              }
              return (
                <div className="space-y-3">
                  {isClosed && <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center">🔒 Snapshot at close</p>}
                  <div className="flex justify-between text-sm font-bold font-mono-numbers">
                    <span style={{ color: colors.yes }}>{storedYes.toFixed(0)}% YES</span>
                    <span style={{ color: colors.no }}>{storedNo.toFixed(0)}% NO</span>
                  </div>
                  <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
                    <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${storedYes}%`, backgroundColor: colors.yes, opacity: isClosed ? 0.75 : 1 }} />
                    <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${storedNo}%`, backgroundColor: colors.no, opacity: isClosed ? 0.75 : 1 }} />
                  </div>
                </div>
              );
            }
            if (liveTotal === 0) {
              return <p className="text-xs text-muted-foreground/70 text-center py-1 italic">{isClosed ? 'No predictions were recorded before close.' : 'No predictions yet — be the first to call it'}</p>;
            }
            return (
              <div className="space-y-3">
                {isClosed && <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center">🔒 Snapshot at close</p>}
                <div className="flex justify-between text-sm font-bold font-mono-numbers">
                  <span style={{ color: colors.yes }}>{yesPercent.toFixed(0)}% YES</span>
                  <span style={{ color: colors.no }}>{noPercent.toFixed(0)}% NO</span>
                </div>
                <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
                  <div
                    className="h-full transition-all duration-1000 ease-out"
                    style={{ width: `${yesPercent}%`, backgroundColor: colors.yes, opacity: isClosed ? 0.75 : 1 }}
                  />
                  <div
                    className="h-full transition-all duration-1000 ease-out"
                    style={{ width: `${noPercent}%`, backgroundColor: colors.no, opacity: isClosed ? 0.75 : 1 }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono-numbers -mt-0.5">
                  <span>{yes.toLocaleString()} YES</span>
                  <span>{liveTotal.toLocaleString()} total</span>
                  <span>{no.toLocaleString()} NO</span>
                </div>
              </div>
            );
          })()
        ) : (
          (() => {
            const map = (tally?.tallies ?? {}) as Record<string, number>;
            const yes = map['YES'] ?? 0;
            const no = map['NO'] ?? 0;
            const liveTotal = yes + no;
            const winningPct = liveTotal > 0
              ? Math.round(market.resolvedOutcome === 'YES' ? (yes / liveTotal) * 100 : market.resolvedOutcome === 'NO' ? (no / liveTotal) * 100 : 0)
              : null;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm text-muted-foreground font-medium">
                  <span>Final Result:</span>
                  <span
                    className="font-bold font-mono-numbers text-lg"
                    style={{ color: market.resolvedOutcome === 'YES' ? colors.yes : market.resolvedOutcome === 'NO' ? colors.no : undefined }}
                  >
                    {market.resolvedOutcome === 'YES' ? '✓ YES won' : market.resolvedOutcome === 'NO' ? '✗ NO won' : market.resolvedOutcome ?? '—'}
                  </span>
                </div>
                {winningPct !== null && (
                  <p className="text-[11px] text-muted-foreground text-right font-mono-numbers">
                    {winningPct}% of crowd called it · {liveTotal.toLocaleString()} {liveTotal === 1 ? 'prediction' : 'predictions'}
                  </p>
                )}
              </div>
            );
          })()
        )}
        {!isResolved && !isClosed && market.status !== 'SCHEDULED' && (
          <div className="pt-2">
            <span className="text-[11px] font-bold text-primary/80 group-hover:text-primary transition-colors">Make your prediction →</span>
          </div>
        )}
        {market.status === 'SCHEDULED' && (
          <div className="pt-2">
            <span className="text-[11px] font-medium text-amber-500/80">
              {(market as any).scheduledFor
                ? `Opens ${new Date((market as any).scheduledFor).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — make your call when it opens`
                : 'Coming soon — make your call when it opens'}
            </span>
          </div>
        )}
        </CardContent>
      </Card>
    </Link>
  );
}
