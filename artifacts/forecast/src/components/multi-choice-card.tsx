import { Market } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/categories";

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

// Vivid chartreuse-to-espresso palette for contender bars
const CONTENDER_COLORS = [
  "#CFEA3B", // chartreuse primary
  "#3ECDE8", // robin's egg blue
  "#E87B3E", // terracotta
  "#8B5CF6", // violet
  "#EC4899", // pink
];

export function MultiChoiceCard({ market }: { market: Market }) {
  const data = parseMultiChoiceData(market.description);
  const isResolved = market.status === "RESOLVED";

  // Equal split shown on card — detail page shows real prediction counts
  const contenders = data?.contenders ?? [];
  const splitPct = contenders.length > 0 ? Math.floor(100 / contenders.length) : 20;

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
              {getCategoryIcon(market.category)} {market.category === "LOCAL_PULSE" ? "Local Pulse" : market.category}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
              {formatNumber(market.totalPredictions)} PREDICTIONS
            </Badge>
          </div>

          {/* Crown + label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">👑 Multi-Choice Race</span>
          </div>

          <h3 className="font-editorial text-xl font-bold leading-tight group-hover:text-primary transition-colors">
            {market.question}
          </h3>

          {data?.period && (
            <p className="text-xs text-muted-foreground mt-1">{data.period}</p>
          )}
        </CardHeader>

        <CardContent className="mt-auto pt-0 space-y-2">
          {/* Contender bars */}
          {contenders.length > 0 && (
            <div className="space-y-1.5 bg-muted/30 rounded-xl p-3">
              {contenders.slice(0, 5).map((c, i) => (
                <div key={c.key} className="flex items-center gap-2">
                  <span className="text-xs font-bold w-20 truncate text-foreground/80">{c.name}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${splitPct}%`,
                        backgroundColor: CONTENDER_COLORS[i % CONTENDER_COLORS.length],
                      }}
                    />
                  </div>
                  {isResolved && market.resolvedOutcome === c.key && (
                    <span className="text-[10px] font-bold text-primary">👑 WIN</span>
                  )}
                </div>
              ))}
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
