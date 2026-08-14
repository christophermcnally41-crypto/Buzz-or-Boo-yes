import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { CountdownBadge } from "./countdown-badge";

interface TheCallOption {
  key: string;
  label: string;
}

interface TheCallData {
  options: TheCallOption[];
  context?: string;
}

function parseTheCallData(description: string | null | undefined): TheCallData | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    if (Array.isArray(parsed.options)) return parsed as TheCallData;
    return null;
  } catch {
    return null;
  }
}

const OPTION_COLORS = [
  "#CFEA3B",
  "#3ECDE8",
  "#E87B3E",
  "#8B5CF6",
  "#EC4899",
  "#22D3EE",
];

export function TheCallCard({ market, featured = false }: { market: Market; featured?: boolean }) {
  const data = parseTheCallData(market.description);
  const isResolved = market.status === "RESOLVED";
  const isScheduled = market.status === "SCHEDULED";
  const options = data?.options ?? [];
  const resolvedOption = isResolved && market.resolvedOutcome
    ? options.find(o => o.key === market.resolvedOutcome)
    : null;

  const { data: tallyData } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: market.status === "OPEN" ? 30000 : false,
    },
  });

  const optionCounts: Record<string, number> = {};
  for (const o of options) optionCounts[o.key] = tallyData?.tallies?.[o.key] ?? 0;

  const totalVotes = Object.values(optionCounts).reduce((a, b) => a + b, 0);
  const hasRealData = totalVotes > 0;

  // Find the leading option
  const leadingKey = hasRealData
    ? Object.entries(optionCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;
  const leadingOption = options.find(o => o.key === leadingKey);

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
              <Badge variant="secondary" className="text-xs font-bold tracking-wider bg-green-500/10 text-green-600 border border-green-500/20">
                🏆 Winner Locked
              </Badge>
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
              {!isResolved && market.status !== 'CLOSED' && <CountdownBadge market={market as any} />}
              {!isScheduled && (
                <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
                  {formatNumber(market.totalPredictions)} {market.totalPredictions === 1 ? 'PICK' : 'PICKS'}
                </Badge>
              )}
            </div>
          </div>

          {/* Engine label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">🎯 The Call</span>
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

          {/* "The crowd says…" teaser */}
          {hasRealData && leadingOption && !isResolved && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              {market.status === 'CLOSED' ? 'Ahead at close — ' : 'The crowd says '}
              <span className="font-bold not-italic text-foreground">{leadingOption.label}</span>
            </p>
          )}
          {isResolved && resolvedOption && (
            <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: `${OPTION_COLORS[options.findIndex(o => o.key === resolvedOption.key) % OPTION_COLORS.length]}18`, border: `1px solid ${OPTION_COLORS[options.findIndex(o => o.key === resolvedOption.key) % OPTION_COLORS.length]}40` }}>
              <span className="text-xs">✓</span>
              <p className="text-xs font-bold" style={{ color: OPTION_COLORS[options.findIndex(o => o.key === resolvedOption.key) % OPTION_COLORS.length] }}>
                Winner: {resolvedOption.label}
              </p>
            </div>
          )}
          {isResolved && !resolvedOption && leadingOption && (
            <p className="text-xs mt-1.5 italic" style={{ color: OPTION_COLORS[0] }}>
              Crowd verdict locked · <span className="font-bold">{leadingOption.label}</span>
            </p>
          )}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-2">
          {options.length > 0 && (
            <div className="space-y-1.5 bg-muted/30 rounded-xl p-3">
              {(!hasRealData && market.status !== "SCHEDULED" && market.status !== "CLOSED" && !isResolved) && (
                <p className="text-[10px] text-muted-foreground text-center pb-1">No picks yet — be first</p>
              )}
              {(!hasRealData && isResolved) && (
                <p className="text-[10px] text-muted-foreground text-center pb-1">No picks were recorded before close.</p>
              )}
              {(hasRealData && market.status === "CLOSED" && !isResolved) && (
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center pb-1">🔒 Snapshot at close</p>
              )}
              {!hasRealData && market.status === "CLOSED" && (
                <p className="text-[10px] text-muted-foreground text-center pb-1">🔒 Picks closed · Awaiting resolution</p>
              )}
              {market.status === "SCHEDULED" && !hasRealData ? (
                <>
                  <p className="text-[10px] text-muted-foreground text-center py-1">
                    {(market as any).scheduledFor
                      ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — picks will appear here`
                      : 'Opens soon — picks will appear here'}
                  </p>
                  {options.map((o, i) => (
                    <div key={o.key} className="flex items-center gap-2 opacity-35">
                      <span className="text-xs font-bold w-20 truncate text-muted-foreground">{o.label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: '0%', backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }} />
                      </div>
                      <span className="text-[10px] font-mono-numbers text-muted-foreground w-14 text-right">—</span>
                    </div>
                  ))}
                </>
              ) : (
                options.map((o, i) => {
                  const count = optionCounts[o.key] ?? 0;
                  const pct = hasRealData
                    ? Math.round((count / totalVotes) * 100)
                    : 0;
                  const isLeading = o.key === leadingKey && hasRealData;
                  const isWinner = isResolved && o.key === market.resolvedOutcome;
                  return (
                    <div key={o.key} className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-20 truncate ${isWinner ? "text-foreground" : isLeading ? "text-foreground" : "text-foreground/70"}`}>
                        {isWinner ? "🏆 " : ""}{o.label}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length],
                            opacity: isWinner ? 1 : isLeading ? 1 : 0.65,
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono-numbers text-muted-foreground w-14 text-right">
                        {hasRealData ? `${pct}% · ${count.toLocaleString()}` : '—'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {hasRealData && !isResolved && !isScheduled && market.status !== 'CLOSED' && (() => {
            const sorted = Object.entries(optionCounts).sort((a, b) => b[1] - a[1]);
            const runnerUpEntry = sorted[1];
            if (!runnerUpEntry || runnerUpEntry[1] === 0) return null;
            const runnerUpOpt = options.find(o => o.key === runnerUpEntry[0]);
            const runnerUpPct = Math.round((runnerUpEntry[1] / totalVotes) * 100);
            return runnerUpOpt ? (
              <p className="text-[10px] text-muted-foreground/50 text-center -mt-0.5">Runner-up: {runnerUpOpt.label} · {runnerUpPct}%</p>
            ) : null;
          })()}
          <div className="flex items-center justify-between pt-1">
            {data?.context ? (
              <p className="text-[11px] text-muted-foreground leading-snug flex-1 mr-2">{data.context}</p>
            ) : <span className="flex-1" />}
            {!isScheduled && (
              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                {formatNumber(totalVotes)} {totalVotes === 1 ? "pick" : "picks"}
              </span>
            )}
          </div>
          {!isResolved && !isScheduled && market.status !== 'CLOSED' && (
            <div className="pt-1">
              <span className="text-[11px] font-bold text-primary/80 group-hover:text-primary transition-colors flex items-center gap-1">
                {totalVotes === 0 ? "Be the first to pick →" : "Make your pick →"}
              </span>
            </div>
          )}
          {isScheduled && (
            <div className="pt-1">
              <span className="text-[11px] font-medium text-amber-500/80 flex items-center gap-1">
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
