import { useMemo } from "react";
import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { getMarketColors } from "@/lib/market-colors";
import { CountdownBadge } from "./countdown-badge";
import { getTallyRefetchInterval } from "@/lib/tally-poll";

interface HeadToHeadData {
  entityA: string;
  entityB: string;
  metric: string;
  period?: string;
  addressA?: string;
  addressB?: string;
  note?: string;
}

function parseHeadToHeadData(description: string | null | undefined): HeadToHeadData | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    if (parsed.entityA && parsed.entityB) return parsed as HeadToHeadData;
    return null;
  } catch {
    return null;
  }
}

export function HeadToHeadCard({ market, featured = false }: { market: Market; featured?: boolean }) {
  const data = parseHeadToHeadData(market.description);
  const colors = getMarketColors(market.id);
  const isResolved = market.status === "RESOLVED";
  const isScheduled = market.status === "SCHEDULED";
  const featuredClass = featured ? " md:col-span-2 shadow-md border-primary/20" : "";

  // Live tally polling — same pattern as BuzzOrBooCard
  const { data: tally } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: getTallyRefetchInterval(market.status),
    },
  });

  const { yesPercent, noPercent, yesCount, noCount, hasRealData: tallyHasData } = useMemo(() => {
    const map = (tally?.tallies ?? {}) as Record<string, number>;
    const yes = map['YES'] ?? 0;
    const no = map['NO'] ?? 0;
    const total = yes + no;
    if (total > 0) {
      return {
        yesPercent: (yes / total) * 100,
        noPercent: (no / total) * 100,
        yesCount: yes,
        noCount: no,
        hasRealData: true,
      };
    }
    return {
      yesPercent: market.yesPercent ?? 50,
      noPercent: market.noPercent ?? 50,
      yesCount: 0,
      noCount: 0,
      hasRealData: false,
    };
  }, [tally, market.yesPercent, market.noPercent]);

  if (!data) {
    // Fallback to standard rendering if data can't be parsed
    return (
      <Link href={`/markets/${market.id}`}>
        <Card className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50${featuredClass}`}>
          <CardContent className="p-6">
            <p className="font-editorial text-xl font-bold">{market.question}</p>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden${featuredClass}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            {isScheduled ? (
              <Badge variant="secondary" className="text-xs font-bold tracking-wider" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>
                {(market as any).scheduledFor
                  ? `🗓 Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : '🗓 Coming Soon'}
              </Badge>
            ) : isResolved ? (
              (() => {
                const outcome = (market as any).resolvedOutcome as string | null | undefined;
                const winner = outcome === 'YES' ? data.entityA : outcome === 'NO' ? data.entityB : null;
                const winnerColor = outcome === 'YES' ? colors.yes : outcome === 'NO' ? colors.no : undefined;
                return (
                  <Badge variant="secondary" className="text-xs font-bold tracking-wider border" style={winnerColor ? { backgroundColor: `${winnerColor}18`, color: winnerColor, borderColor: `${winnerColor}44` } : { backgroundColor: '#6b728018', color: '#9ca3af', borderColor: '#6b728044' }}>
                    🏆 {winner ? `${winner} wins` : 'Resolved'}
                  </Badge>
                );
              })()
            ) : market.status === 'CLOSED' ? (
              <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-muted/60 text-muted-foreground border border-border/50">
                🔒 Closed · Snapshot
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
                  ⚔️ Head to Head
                </Badge>
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  Live
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {!isResolved && market.status !== 'CLOSED' && <CountdownBadge market={market as any} />}
              {market.status !== 'SCHEDULED' && (
                <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
                  {formatNumber(market.totalPredictions)} {market.totalPredictions === 1 ? 'PICK' : 'PICKS'}
                </Badge>
              )}
            </div>
          </div>
          {/* Entity names in header */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-bold">
            <span className="truncate" style={{ color: colors.yes }}>{data.entityA}</span>
            <span className="text-[10px] text-muted-foreground/50 font-editorial">vs</span>
            <span className="truncate text-right" style={{ color: colors.no }}>{data.entityB}</span>
          </div>
        </CardHeader>

        <CardContent className="pt-0 mt-auto space-y-4">
          {/* The two entities */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {/* Entity A */}
            <div className={`text-left transition-opacity ${isResolved && market.resolvedOutcome === 'NO' ? "opacity-40" : ""}`}>
              {!isScheduled && tallyHasData && (
                <div
                  className="text-xs font-bold tracking-wider uppercase mb-1"
                  style={{ color: colors.yes }}
                >
                  {yesPercent.toFixed(0)}%
                  {isResolved && market.resolvedOutcome === 'YES' && (
                    <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider bg-green-500/15 text-green-600 px-1 py-0.5 rounded">🏆 Winner</span>
                  )}
                  {!isResolved && yesPercent > noPercent && yesPercent > 0 && (
                    <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded">Leading</span>
                  )}
                </div>
              )}
              <div className="font-editorial text-lg font-bold leading-tight group-hover:opacity-80 transition-opacity">
                {data.entityA}
              </div>
              {data.addressA && (
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{data.addressA}</div>
              )}
            </div>

            <div className="flex flex-col items-center">
              <div className="w-px h-8 bg-border/50" />
              <div className="text-xs font-bold text-muted-foreground/50 my-1 font-editorial">vs</div>
              <div className="w-px h-8 bg-border/50" />
            </div>

            {/* Entity B */}
            <div className={`text-right transition-opacity ${isResolved && market.resolvedOutcome === 'YES' ? "opacity-40" : ""}`}>
              {!isScheduled && tallyHasData && (
                <div
                  className="text-xs font-bold tracking-wider uppercase mb-1"
                  style={{ color: colors.no }}
                >
                  {noPercent.toFixed(0)}%
                  {isResolved && market.resolvedOutcome === 'NO' && (
                    <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider bg-green-500/15 text-green-600 px-1 py-0.5 rounded">🏆 Winner</span>
                  )}
                  {!isResolved && noPercent > yesPercent && noPercent > 0 && (
                    <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-600 dark:text-violet-400 px-1 py-0.5 rounded">Leading</span>
                  )}
                </div>
              )}
              <div className="font-editorial text-lg font-bold leading-tight group-hover:opacity-80 transition-opacity">
                {data.entityB}
              </div>
              {data.addressB && (
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{data.addressB}</div>
              )}
            </div>
          </div>

          {/* Metric / question */}
          {data.metric && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 text-center mb-1">
              {data.metric}{data.period ? ` · ${data.period}` : ""}
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center leading-snug border-t border-border/30 pt-3">
            {market.question}
          </p>

          {/* Split bar — live */}
          {!isResolved ? (
            isScheduled ? (
              <p className="text-xs font-semibold text-center py-1" style={{ color: "#f59e0b" }}>
                {(market as any).scheduledFor
                  ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${new Date((market as any).scheduledFor).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — pick the winner when it goes live`
                  : 'Opens soon — pick the winner when it goes live'}
              </p>
            ) : tallyHasData ? (
              <>
                {market.status === 'CLOSED' && (
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center mb-1">🔒 Snapshot at close</p>
                )}
                <div className="flex justify-between text-xs font-bold font-mono-numbers mb-1">
                  <span style={{ color: colors.yes }}>{yesPercent.toFixed(0)}%</span>
                  <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest self-center font-normal">Live picks</span>
                  <span style={{ color: colors.no }}>{noPercent.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden flex">
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-l-full"
                    style={{ width: `${yesPercent}%`, backgroundColor: colors.yes, opacity: market.status === 'CLOSED' ? 0.75 : 1 }}
                  />
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-r-full"
                    style={{ width: `${noPercent}%`, backgroundColor: colors.no, opacity: market.status === 'CLOSED' ? 0.75 : 1 }}
                  />
                </div>
                {market.status !== 'CLOSED' && (() => {
                  const margin = Math.abs(Math.round(yesPercent) - Math.round(noPercent));
                  const leader = yesPercent > noPercent ? data.entityA : noPercent > yesPercent ? data.entityB : null;
                  return leader ? (
                    <p className="text-[10px] text-center text-muted-foreground/50 mt-0.5">{leader} leads +{margin}pp</p>
                  ) : (
                    <p className="text-[10px] text-center text-muted-foreground/50 mt-0.5">⚖️ Dead even</p>
                  );
                })()}
                <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono-numbers mt-1">
                  <span style={{ color: colors.yes }}>{data.entityA} · {yesCount.toLocaleString()} {yesCount === 1 ? 'pick' : 'picks'}</span>
                  <span>{(yesCount + noCount).toLocaleString()} total</span>
                  <span style={{ color: colors.no }}>{noCount.toLocaleString()} {noCount === 1 ? 'pick' : 'picks'} · {data.entityB}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">{market.status === 'CLOSED' ? 'No picks were recorded before close.' : 'No picks yet — be first to call it'}</p>
            )
          ) : (
            <div className="pt-2 border-t border-border/30 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Winner</span>
                <span className="font-bold" style={{ color: market.resolvedOutcome === 'YES' ? colors.yes : market.resolvedOutcome === 'NO' ? colors.no : undefined }}>
                  {market.resolvedOutcome === 'YES' ? data.entityA : market.resolvedOutcome === 'NO' ? data.entityB : market.resolvedOutcome ? market.resolvedOutcome : '—'}
                </span>
              </div>
              {tallyHasData ? (
                <>
                  <div className="flex justify-between text-xs font-bold font-mono-numbers text-muted-foreground">
                    <span style={{ color: colors.yes }}>{yesPercent.toFixed(0)}%</span>
                    <span style={{ color: colors.no }}>{noPercent.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex">
                    <div className="h-full rounded-l-full" style={{ width: `${yesPercent}%`, backgroundColor: colors.yes }} />
                    <div className="h-full rounded-r-full" style={{ width: `${noPercent}%`, backgroundColor: colors.no }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{Math.round((yesPercent / 100) * (yesCount + noCount))} picks</span>
                    <span className="text-[9px] opacity-60">🔒 Snapshot</span>
                    <span>{Math.round((noPercent / 100) * (yesCount + noCount))} picks</span>
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center">No picks recorded</p>
              )}
            </div>
          )}
          {!isResolved && market.status !== 'CLOSED' && market.status !== 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-bold text-primary/80 group-hover:text-primary transition-colors">Pick the winner →</span>
            </div>
          )}
          {market.status === 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-medium text-amber-500/80">
                {(market as any).scheduledFor
                  ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — check back to pick`
                  : 'Coming soon — check back to pick'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
