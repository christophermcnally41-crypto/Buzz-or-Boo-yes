import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { useMemo } from "react";
import { getTallyRefetchInterval } from "@/lib/tally-poll";
import { CountdownBadge } from "./countdown-badge";

const BUZZ_COLOR = "#CFEA3B";
const BOO_COLOR = "#E8503E";

export function BuzzOrBooCard({ market, featured = false }: { market: Market; featured?: boolean }) {
  const buzzColor = BUZZ_COLOR;
  const booColor = BOO_COLOR;

  const isResolved = market.status === "RESOLVED";
  const isScheduled = market.status === "SCHEDULED";

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
      <Card className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden${featured ? " md:col-span-2 shadow-md border-primary/20" : ""}`}>
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
                const color = outcome === 'YES' ? BUZZ_COLOR : BOO_COLOR;
                const label = outcome === 'YES' ? '⚡ BUZZ WON' : outcome === 'NO' ? '👎 BOO WON' : '✓ Resolved';
                return (
                  <Badge variant="secondary" className="text-xs font-bold tracking-wider" style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}>
                    {label}
                  </Badge>
                );
              })()
            ) : market.status === 'CLOSED' ? (
              <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-muted text-muted-foreground border border-border/50">
                🔒 Closed
              </Badge>
            ) : (() => {
              const yes = tallyData?.tallies?.["YES"] ?? 0;
              const no = tallyData?.tallies?.["NO"] ?? 0;
              const tallyLoaded = tallyData !== undefined;
              const liveTallyTotal = yes + no;
              // Only declare sentiment when we have confirmed live tally data
              if (tallyLoaded && liveTallyTotal === 0 && (market.totalPredictions ?? 0) === 0) {
                return (
                  <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-muted/60 text-muted-foreground border border-border/50">
                    No verdicts yet
                  </Badge>
                );
              }
              if (!tallyLoaded && (market.totalPredictions ?? 0) === 0) {
                return (
                  <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-muted/60 text-muted-foreground border border-border/50 animate-pulse">
                    Loading…
                  </Badge>
                );
              }
              return (
                <Badge
                  variant="secondary"
                  className="text-xs font-bold tracking-wider"
                  style={{ backgroundColor: dominantBuzz ? `${BUZZ_COLOR}22` : `${BOO_COLOR}22`, color: dominantBuzz ? BUZZ_COLOR : BOO_COLOR, border: `1px solid ${dominantBuzz ? BUZZ_COLOR : BOO_COLOR}44` }}
                >
                  {dominantBuzz ? "⚡ BUZZING" : "👎 BOO'D"}
                </Badge>
              );
            })()}
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {market.status !== 'RESOLVED' && market.status !== 'CLOSED' && <CountdownBadge market={market as any} />}
              {market.status !== 'SCHEDULED' && (() => {
                const buzzCount = tallyData?.tallies?.["YES"] ?? 0;
                const booCount = tallyData?.tallies?.["NO"] ?? 0;
                return (
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50 shrink-0">
                    {`⚡ ${formatNumber(buzzCount)} · 👎 ${formatNumber(booCount)}`}
                  </Badge>
                );
              })()}
            </div>
          </div>

          {/* Format label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">⚡ Buzz or Boo</span>
            {!isScheduled && !isResolved && market.status !== 'CLOSED' && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Live
              </span>
            )}
          </div>

          {/* Subject — big, editorial */}
          <h3 className={`font-editorial font-bold leading-tight group-hover:text-primary transition-colors${featured ? " text-3xl md:text-4xl" : " text-2xl"}`}>
            {market.title}
          </h3>
          {market.question !== market.title && (
            <p className="text-sm text-muted-foreground mt-1 leading-snug">{market.question}</p>
          )}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-3">
          {/* Sentiment split bar */}
          <div className="space-y-2 pt-3 border-t border-border/30">
            {isScheduled ? (
              <>
                <p className="text-xs font-semibold text-center py-1" style={{ color: "#f59e0b" }}>
                  {(market as any).scheduledFor
                    ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — cast your verdict when it goes live`
                    : 'Opens soon — cast your verdict when it goes live'}
                </p>
                <div className="flex justify-between text-sm font-bold font-mono-numbers opacity-25">
                  <span style={{ color: buzzColor }}>⚡ BUZZ</span>
                  <span style={{ color: booColor }}>👎 BOO</span>
                </div>
              </>
            ) : market.status === 'CLOSED' && !isResolved && (tallyData?.tallies?.["YES"] ?? 0) + (tallyData?.tallies?.["NO"] ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-1">🔒 Voting closed · Awaiting resolution</p>
            ) : !isResolved && (tallyData?.tallies?.["YES"] ?? 0) + (tallyData?.tallies?.["NO"] ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-1">No verdicts yet — be first</p>
            ) : (
              <>
                {market.status === 'CLOSED' && !isResolved && (
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center mb-1">🔒 Snapshot at close</p>
                )}
                <div className="flex justify-between text-sm font-bold font-mono-numbers">
                  <span style={{ color: buzzColor }}>⚡ {buzzPercent.toFixed(0)}% BUZZ</span>
                  <span style={{ color: booColor }}>👎 {booPercent.toFixed(0)}% BOO</span>
                </div>
                <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-l-full"
                    style={{ width: `${buzzPercent}%`, backgroundColor: buzzColor, opacity: market.status === 'CLOSED' && !isResolved ? 0.75 : 1 }}
                  />
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-r-full"
                    style={{ width: `${booPercent}%`, backgroundColor: booColor, opacity: market.status === 'CLOSED' && !isResolved ? 0.75 : 1 }}
                  />
                </div>
                {market.status !== 'CLOSED' && !isResolved && (() => {
                  const margin = Math.abs(Math.round(buzzPercent) - Math.round(booPercent));
                  const leader = buzzPercent > booPercent ? '⚡ BUZZ' : booPercent > buzzPercent ? '👎 BOO' : null;
                  return leader ? (
                    <p className="text-[10px] text-center text-muted-foreground/50 -mt-0.5">{leader} leads +{margin}pp</p>
                  ) : null;
                })()}
                <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono-numbers -mt-0.5">
                  <span>{tallyData?.tallies?.["YES"] ?? 0} BUZZ</span>
                  <span>{tallyData?.tallies?.["NO"] ?? 0} BOO</span>
                </div>
              </>
            )}

            {isResolved && market.resolvedOutcome && (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold" style={{
                backgroundColor: market.resolvedOutcome === 'YES' ? `${BUZZ_COLOR}18` : `${BOO_COLOR}18`,
                border: `1px solid ${market.resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR}44`,
                color: market.resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR,
              }}>
                {market.resolvedOutcome === 'YES' ? '⚡ BUZZ won' : '👎 BOO won'}
                <span className="text-muted-foreground font-normal ml-1">· {market.resolvedAt ? new Date(market.resolvedAt).toLocaleDateString() : "Closed"}</span>
              </div>
            )}
            {isResolved && !market.resolvedOutcome && (
              <div className="text-xs text-center text-muted-foreground font-medium">
                {((tallyData?.tallies?.["YES"] ?? 0) + (tallyData?.tallies?.["NO"] ?? 0)) === 0
                  ? "No votes recorded — market closed without a verdict"
                  : `Sentiment snapshot — ${market.resolvedAt ? new Date(market.resolvedAt).toLocaleDateString() : "Closed"}`}
              </div>
            )}
          </div>
          {!isResolved && market.status !== 'CLOSED' && market.status !== 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-bold text-primary/80 group-hover:text-primary transition-colors">Cast your verdict →</span>
            </div>
          )}
          {market.status === 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-medium text-amber-500/80">
                {(market as any).scheduledFor
                  ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — check back to vote`
                  : 'Coming soon — check back to vote'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
