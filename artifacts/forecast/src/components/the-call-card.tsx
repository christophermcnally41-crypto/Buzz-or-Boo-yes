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

export function TheCallCard({ market }: { market: Market }) {
  const data = parseTheCallData(market.description);
  const isResolved = market.status === "RESOLVED";
  const options = data?.options ?? [];

  const { data: tallyData } = useGetMarketTally(market.id, {
    query: { queryKey: getGetMarketTallyQueryKey(market.id) }
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
      <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
              <CategoryIcon category={market.category} className="w-3.5 h-3.5" /> {getCategoryLabel(market.category)}
            </Badge>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <CountdownBadge market={market as any} />
              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
                {formatNumber(market.totalPredictions)} PICKS
              </Badge>
            </div>
          </div>

          {/* Engine label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">🎯 The Call</span>
          </div>

          <h3 className="font-editorial text-xl font-bold leading-tight group-hover:text-primary transition-colors">
            {market.question}
          </h3>

          {/* "The crowd says…" teaser */}
          {hasRealData && leadingOption && !isResolved && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              The crowd says <span className="font-bold not-italic text-foreground">{leadingOption.label}</span>
            </p>
          )}
          {isResolved && leadingOption && (
            <p className="text-xs mt-1.5 italic" style={{ color: OPTION_COLORS[0] }}>
              Crowd verdict locked · <span className="font-bold">{leadingOption.label}</span>
            </p>
          )}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-2">
          {options.length > 0 && (
            <div className="space-y-1.5 bg-muted/30 rounded-xl p-3">
              {options.slice(0, 6).map((o, i) => {
                const count = optionCounts[o.key] ?? 0;
                const pct = hasRealData
                  ? Math.round((count / totalVotes) * 100)
                  : Math.floor(100 / options.length);
                const isLeading = o.key === leadingKey && hasRealData;
                return (
                  <div key={o.key} className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-20 truncate ${isLeading ? "text-foreground" : "text-foreground/70"}`}>
                      {o.label}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length],
                          opacity: isLeading ? 1 : 0.65,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono-numbers text-muted-foreground w-7 text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {data?.context && (
            <p className="text-[11px] text-muted-foreground leading-snug pt-1">{data.context}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
