import { useMemo } from "react";
import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { cn, formatNumber } from "@/lib/utils";
import { getMarketColors } from "@/lib/market-colors";
import { CountdownBadge } from "./countdown-badge";
import { getTallyRefetchInterval } from "@/lib/tally-poll";

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

export function HotOrNotCard({ market, featured = false }: { market: Market; featured?: boolean }) {
  const data = parseHotOrNotData(market.description);
  const colors = getMarketColors(market.id);
  const isResolved = market.status === "RESOLVED";
  const isScheduled = market.status === "SCHEDULED";

  // Live tally polling — same pattern as BuzzOrBooCard
  const { data: tally } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: getTallyRefetchInterval(market.status),
    },
  });

  const { hotPercent, notPercent, hasRealData } = useMemo(() => {
    const map = (tally?.tallies ?? {}) as Record<string, number>;
    const yes = map['YES'] ?? 0;
    const no = map['NO'] ?? 0;
    const total = yes + no;
    if (total > 0) {
      return {
        hotPercent: (yes / total) * 100,
        notPercent: (no / total) * 100,
        hasRealData: true,
      };
    }
    return {
      hotPercent: market.yesPercent ?? 50,
      notPercent: market.noPercent ?? 50,
      hasRealData: false,
    };
  }, [tally, market.yesPercent, market.noPercent]);

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden${featured ? " md:col-span-2 shadow-md border-primary/20" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            {isScheduled ? (
              <Badge variant="secondary" className="text-xs font-bold tracking-wider" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>
                🗓 Coming Soon
              </Badge>
            ) : isResolved ? (
              (() => {
                const outcome = (market as any).resolvedOutcome as string | null | undefined;
                return (
                  <Badge variant="secondary" className={`text-xs font-bold tracking-wider ${outcome === 'YES' ? 'bg-red-500/10 text-red-600 border border-red-500/20' : outcome === 'NO' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' : 'bg-green-500/10 text-green-600 border border-green-500/20'}`}>
                    {outcome === 'YES' ? '🔥 HOT WON' : outcome === 'NO' ? '❄️ NOT WON' : '✓ Resolved'}
                  </Badge>
                );
              })()
            ) : market.status === 'CLOSED' ? (
              <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-muted text-muted-foreground border border-border/50">
                🔒 Closed
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
                  🔥 Hot or Not
                </Badge>
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  Live
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {!isResolved && market.status !== 'CLOSED' && <CountdownBadge market={market as any} />}
              {market.status !== 'SCHEDULED' && (() => {
                const hotCount = tally?.tallies?.['YES'] ?? 0;
                const notCount = tally?.tallies?.['NO'] ?? 0;
                return (
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
                    {`🔥 ${formatNumber(hotCount)} · ❄️ ${formatNumber(notCount)}`}
                  </Badge>
                );
              })()}
            </div>
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

          {/* 🔥 HOT / ❄️ NOT bar — live */}
          {!isResolved ? (
            <div className="space-y-2 pt-1 border-t border-border/30">
              {isScheduled ? (
                <>
                  <p className="text-xs font-semibold text-center py-1" style={{ color: "#f59e0b" }}>
                    {(market as any).scheduledFor
                      ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — make your call when it goes live`
                      : 'Opens soon — make your call when it goes live'}
                  </p>
                  <div className="flex justify-between text-sm font-bold font-mono-numbers opacity-25">
                    <span style={{ color: colors.yes }}>🔥 HOT</span>
                    <span style={{ color: colors.no }}>❄️ NOT HOT</span>
                  </div>
                </>
              ) : hasRealData ? (
                <>
                  {market.status === 'CLOSED' && (
                    <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center mb-1">🔒 Snapshot at close</p>
                  )}
                  <div className="flex justify-between text-sm font-bold font-mono-numbers">
                    <span style={{ color: colors.yes }}>🔥 {hotPercent.toFixed(0)}% HOT</span>
                    <span style={{ color: colors.no }}>❄️ {notPercent.toFixed(0)}% NOT</span>
                  </div>
                  <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden flex">
                    <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${hotPercent}%`, backgroundColor: colors.yes, opacity: market.status === 'CLOSED' ? 0.75 : 1 }} />
                    <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${notPercent}%`, backgroundColor: colors.no, opacity: market.status === 'CLOSED' ? 0.75 : 1 }} />
                  </div>
                  {market.status !== 'CLOSED' && (() => {
                    const margin = Math.abs(Math.round(hotPercent) - Math.round(notPercent));
                    const leader = hotPercent > notPercent ? '🔥 HOT' : notPercent > hotPercent ? '❄️ NOT HOT' : null;
                    return leader ? (
                      <p className="text-[10px] text-center text-muted-foreground/50 -mt-0.5">{leader} leads +{margin}pp</p>
                    ) : null;
                  })()}
                  <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono-numbers -mt-0.5">
                    <span>{tally?.tallies?.['YES'] ?? 0} votes</span>
                    <span>{tally?.tallies?.['NO'] ?? 0} votes</span>
                  </div>
                </>
              ) : market.status === 'CLOSED' ? (
                <p className="text-xs text-muted-foreground text-center py-1">🔒 Voting closed · Awaiting resolution</p>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-1">No verdicts yet — be first</p>
              )}
            </div>
          ) : (
            <div className="pt-1 border-t border-border/30 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{market.resolvedOutcome ? 'Final verdict' : 'Awaiting result'}</span>
                <span className="font-bold font-mono-numbers" style={{ color: market.resolvedOutcome === 'YES' ? colors.yes : market.resolvedOutcome === 'NO' ? colors.no : undefined }}>
                  {market.resolvedOutcome === 'YES' ? '🔥 Hot' : market.resolvedOutcome === 'NO' ? '❄️ Not Hot' : '—'}
                </span>
              </div>
              {hasRealData && (
                <>
                  <div className="flex justify-between text-xs font-bold font-mono-numbers text-muted-foreground">
                    <span style={{ color: colors.yes }}>🔥 {hotPercent.toFixed(0)}%</span>
                    <span style={{ color: colors.no }}>❄️ {notPercent.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex">
                    <div className="h-full" style={{ width: `${hotPercent}%`, backgroundColor: colors.yes }} />
                    <div className="h-full" style={{ width: `${notPercent}%`, backgroundColor: colors.no }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono-numbers -mt-0.5">
                    <span>{tally?.tallies?.['YES'] ?? 0} votes</span>
                    <span>{tally?.tallies?.['NO'] ?? 0} votes</span>
                  </div>
                </>
              )}
            </div>
          )}
          {!isResolved && market.status !== 'CLOSED' && market.status !== 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-bold text-primary/80 group-hover:text-primary transition-colors">Make your call →</span>
            </div>
          )}
          {market.status === 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-medium text-amber-500/80">
                {(market as any).scheduledFor
                  ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — check back to call it`
                  : 'Coming soon — check back to call it'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
