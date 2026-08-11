import { Market, useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { useMemo } from "react";

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

export function MultiChoiceCard({ market }: { market: Market }) {
  const data = parseMultiChoiceData(market.description);
  const isResolved = market.status === "RESOLVED";
  const contenders = data?.contenders ?? [];

  // Fetch server-aggregated vote tallies — much lighter than fetching all predictions
  // Poll every 30 s while the market is active so passive viewers see live bar updates
  const isActive = market.status === "OPEN";
  const { data: tallyData } = useGetMarketTally(market.id, {
    query: {
      queryKey: getGetMarketTallyQueryKey(market.id),
      refetchInterval: isActive ? 30_000 : false,
    }
  });

  const { contenderCounts, totalVotes, hasRealData } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contenders) counts[c.key] = 0;

    if (tallyData?.tallies) {
      for (const [key, count] of Object.entries(tallyData.tallies)) {
        if (key in counts) counts[key] = count;
      }
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { contenderCounts: counts, totalVotes: total, hasRealData: total > 0 };
  }, [tallyData, contenders]);

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
              <CategoryIcon category={market.category} className="w-3.5 h-3.5" /> {getCategoryLabel(market.category)}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
              {formatNumber(market.totalPredictions)} CALLS
            </Badge>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">⚡ Buzz Battle</span>
          </div>

          <h3 className="font-editorial text-xl font-bold leading-tight group-hover:text-primary transition-colors">
            {market.question}
          </h3>

          {data?.period && (
            <p className="text-xs text-muted-foreground mt-1">{data.period}</p>
          )}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-2">
          {contenders.length > 0 && (
            <div className="space-y-1.5 bg-muted/30 rounded-xl p-3">
              {contenders.slice(0, 5).map((c, i) => {
                const count = contenderCounts[c.key] ?? 0;
                const pct = hasRealData
                  ? Math.round((count / totalVotes) * 100)
                  : Math.floor(100 / contenders.length);
                return (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="text-xs font-bold w-20 truncate text-foreground/80">{c.name}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CONTENDER_COLORS[i % CONTENDER_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono-numbers text-muted-foreground w-7 text-right">
                      {pct}%
                    </span>
                    <span className="text-[10px] font-mono-numbers text-muted-foreground/70 w-10 text-right">
                      {count.toLocaleString()}
                    </span>
                    {isResolved && market.resolvedOutcome === c.key && (
                      <span className="text-[10px] font-bold text-primary">👑</span>
                    )}
                  </div>
                );
              })}
              <div className="flex justify-end pt-1 border-t border-border/30 mt-1">
                <span className="text-[10px] text-muted-foreground/60 font-mono-numbers">
                  {totalVotes.toLocaleString()} total {totalVotes === 1 ? "call" : "calls"}
                </span>
              </div>
            </div>
          )}

          {data?.metric && (
            <p className="text-[11px] text-muted-foreground leading-snug pt-1">{data.metric}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
