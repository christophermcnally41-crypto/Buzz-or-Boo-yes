import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { useMemo } from "react";
import { getTallyRefetchInterval } from "@/lib/tally-poll";
import { CountdownBadge } from "./countdown-badge";

interface Contender {
  key: string;
  name: string;
  venue?: string;
}

interface MultiChoiceData {
  contenders: Contender[];
  metric?: string;
  period?: string;
}

function parseMultiChoiceData(description: string | null | undefined): MultiChoiceData | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    if (Array.isArray(parsed.contenders)) return parsed as MultiChoiceData;
    return null;
  } catch {
    return null;
  }
}

const CONTENDER_COLORS = [
  "#CFEA3B",
  "#3ECDE8",
  "#E87B3E",
  "#8B5CF6",
  "#EC4899",
];

export function MultiChoiceCard({ market, featured = false }: { market: Market; featured?: boolean }) {
  const data = parseMultiChoiceData(market.description);
  const isResolved = market.status === "RESOLVED";
  const isScheduled = market.status === "SCHEDULED";
  const contenders = useMemo(() => data?.contenders ?? [], [data]);

  // Fetch server-aggregated vote tallies — much lighter than fetching all predictions
  // Poll every 30 s while the market is OPEN; stops automatically when it resolves/closes.
  const { data: tallyData } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: getTallyRefetchInterval(market.status),
    }
  });

  const { contenderCounts, totalVotes, hasRealData, leadingKey } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contenders) counts[c.key] = 0;

    if (tallyData?.tallies) {
      for (const [key, count] of Object.entries(tallyData.tallies)) {
        if (key in counts) counts[key] = count;
      }
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const leading = total > 0
      ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
      : null;
    return { contenderCounts: counts, totalVotes: total, hasRealData: total > 0, leadingKey: leading };
  }, [tallyData, contenders]);

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
                const winner = outcome ? contenders.find((c: { key: string; name: string }) => c.key === outcome) : null;
                return (
                  <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    👑 {winner ? winner.name : 'Winner'}
                  </Badge>
                );
              })()
            ) : market.status === 'CLOSED' ? (
              <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-muted text-muted-foreground border border-border/50">
                🔒 Closed
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
                <CategoryIcon category={market.category} className="w-3.5 h-3.5" /> {getCategoryLabel(market.category)}
              </Badge>
            )}
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {isScheduled && (
                <Badge variant="outline" className="text-[10px] font-bold border-amber-500/30 text-amber-600 bg-amber-500/10">
                  🗓 {(market as any).scheduledFor ? `Opens ${new Date((market as any).scheduledFor).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Coming Soon'}
                </Badge>
              )}
              {!isResolved && market.status !== 'CLOSED' && !isScheduled && <CountdownBadge market={market as any} />}
              {market.status !== 'SCHEDULED' && (
                <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
                  {formatNumber(market.totalPredictions)} {market.totalPredictions === 1 ? 'VOTE' : 'VOTES'}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">👑 Buzz Battle</span>
            {!isScheduled && !isResolved && market.status !== 'CLOSED' && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Live
              </span>
            )}
          </div>

          <h3 className="font-editorial text-xl font-bold leading-tight group-hover:text-primary transition-colors">
            {market.question}
          </h3>

          {data?.period && (
            <p className="text-xs text-muted-foreground mt-1">{data.period}</p>
          )}

          {isResolved && market.resolvedOutcome && (() => {
            const winnerContender = contenders.find(c => c.key === market.resolvedOutcome);
            if (!winnerContender) return null;
            return (
              <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/30">
                <span className="text-xs">👑</span>
                <p className="text-xs font-bold text-primary">Winner: {winnerContender.name}</p>
              </div>
            );
          })()}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-2">
          {contenders.length > 0 && (
            <div className="space-y-1.5 bg-muted/30 rounded-xl p-3">
              {isScheduled ? (
                <p className="text-[10px] font-semibold text-center py-1" style={{ color: "#f59e0b" }}>
                  {(market as any).scheduledFor
                    ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — picks appear when live`
                    : 'Opens soon — picks appear when live'}
                </p>
              ) : market.status === 'CLOSED' && !hasRealData ? (
                <p className="text-[10px] text-muted-foreground text-center pb-1">🔒 Picks closed · Awaiting resolution</p>
              ) : isResolved && !hasRealData ? (
                <p className="text-[10px] text-muted-foreground text-center pb-1">No picks were recorded before close.</p>
              ) : (!hasRealData && totalVotes === 0 && market.status === 'OPEN') ? (
                <p className="text-[10px] text-muted-foreground text-center pb-1">No picks yet — back the first contender!</p>
              ) : (market.status === 'CLOSED' && !isResolved && hasRealData) ? (
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center pb-1">🔒 Snapshot at close</p>
              ) : null}
              {contenders.slice(0, 5).map((c, i) => {
                const count = contenderCounts[c.key] ?? 0;
                const pct = hasRealData
                  ? Math.round((count / totalVotes) * 100)
                  : 0;
                const isLeading = !isResolved && hasRealData && c.key === leadingKey;
                const isWinner = isResolved && market.resolvedOutcome === c.key;
                return (
                  <div key={c.key} className={`flex items-center gap-2 rounded-lg transition-colors ${isLeading ? "bg-primary/8 -mx-1 px-1 py-0.5" : ""}`}>
                    <span className={`text-xs font-bold w-20 truncate ${isLeading ? "text-primary" : "text-foreground/80"}`}>{c.name}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CONTENDER_COLORS[i % CONTENDER_COLORS.length],
                        }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono-numbers w-7 text-right ${isLeading ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {pct}%
                    </span>
                    <span className="text-[10px] font-mono-numbers text-muted-foreground/70 w-10 text-right">
                      {count.toLocaleString()}
                    </span>
                    {isWinner && (
                      <span className="text-[10px] font-bold text-yellow-500">👑 WIN</span>
                    )}
                    {isLeading && !isWinner && (
                      <span className="text-[10px] font-bold text-primary/70">▲</span>
                    )}
                  </div>
                );
              })}
              {!isScheduled && contenders.length > 5 && (
                <p className="text-[10px] text-muted-foreground/60 text-center py-0.5">
                  +{contenders.length - 5} more contender{contenders.length - 5 > 1 ? 's' : ''} — open to see all
                </p>
              )}
              {!isScheduled && market.status !== 'CLOSED' && !isResolved && hasRealData && (() => {
                const sorted = Object.entries(contenderCounts).sort((a, b) => b[1] - a[1]);
                const runnerEntry = sorted[1];
                if (!runnerEntry || runnerEntry[1] === 0) return null;
                const runnerContender = contenders.find(c => c.key === runnerEntry[0]);
                const runnerPct = Math.round((runnerEntry[1] / totalVotes) * 100);
                return runnerContender ? (
                  <p className="text-[10px] text-muted-foreground/50 text-center -mt-0.5">Runner-up: {runnerContender.name} · {runnerPct}%</p>
                ) : null;
              })()}
              {!isScheduled && (
                <div className="flex justify-between pt-1 border-t border-border/30 mt-1 items-center">
                  <span className="text-[10px] text-muted-foreground/60 font-mono-numbers">
                    {totalVotes.toLocaleString()} total {totalVotes === 1 ? "vote" : "votes"}
                  </span>
                  {totalVotes === 0 && !isResolved && (
                    <span className="text-[10px] text-muted-foreground/50 italic">be first to back one</span>
                  )}
                </div>
              )}
            </div>
          )}

          {data?.metric && (
            <p className="text-[11px] text-muted-foreground leading-snug pt-1">{data.metric}</p>
          )}
          {!isResolved && market.status !== 'CLOSED' && market.status !== 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-bold text-primary/80 group-hover:text-primary transition-colors">Back a contender →</span>
            </div>
          )}
          {market.status === 'SCHEDULED' && (
            <div className="pt-2">
              <span className="text-[11px] font-medium text-amber-500/80">
                {(market as any).scheduledFor
                  ? `Opens ${new Date((market as any).scheduledFor).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — check back to choose a contender`
                  : 'Coming soon — check back to choose a contender'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
