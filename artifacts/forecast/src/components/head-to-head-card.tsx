import { Market } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { getMarketColors } from "@/lib/market-colors";

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

export function HeadToHeadCard({ market }: { market: Market }) {
  const data = parseHeadToHeadData(market.description);
  const colors = getMarketColors(market.id);
  const yesPercent = market.yesPercent || 50;
  const noPercent = market.noPercent || 50;
  const isResolved = market.status === "RESOLVED";

  if (!data) {
    // Fallback to standard rendering if data can't be parsed
    return (
      <Link href={`/markets/${market.id}`}>
        <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50">
          <CardContent className="p-6">
            <p className="font-editorial text-xl font-bold">{market.question}</p>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col border-border/50 hover:border-primary/30 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 mb-2">
            <Badge variant="secondary" className="bg-background/80 text-xs gap-1.5 font-medium shrink-0">
              🔥 Local Pulse
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
              {formatNumber(market.totalPredictions)} PREDICTIONS
            </Badge>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">⚔️ Head to Head</span>
          </div>
        </CardHeader>

        <CardContent className="pt-0 mt-auto space-y-4">
          {/* The two entities */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="text-left">
              <div
                className="text-xs font-bold tracking-wider uppercase mb-1"
                style={{ color: colors.yes }}
              >
                {yesPercent.toFixed(0)}%
              </div>
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

            <div className="text-right">
              <div
                className="text-xs font-bold tracking-wider uppercase mb-1"
                style={{ color: colors.no }}
              >
                {noPercent.toFixed(0)}%
              </div>
              <div className="font-editorial text-lg font-bold leading-tight group-hover:opacity-80 transition-opacity">
                {data.entityB}
              </div>
              {data.addressB && (
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{data.addressB}</div>
              )}
            </div>
          </div>

          {/* Metric / question */}
          <p className="text-xs text-muted-foreground text-center leading-snug border-t border-border/30 pt-3">
            {market.question}
          </p>

          {/* Split bar */}
          {!isResolved ? (
            <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden flex">
              <div
                className="h-full transition-all duration-1000 ease-out rounded-l-full"
                style={{ width: `${yesPercent}%`, backgroundColor: colors.yes }}
              />
              <div
                className="h-full transition-all duration-1000 ease-out rounded-r-full"
                style={{ width: `${noPercent}%`, backgroundColor: colors.no }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm pt-2 border-t border-border/30">
              <span className="text-muted-foreground">Winner</span>
              <span className="font-bold" style={{ color: market.resolvedOutcome === 'YES' ? colors.yes : colors.no }}>
                {market.resolvedOutcome === 'YES' ? data.entityA : data.entityB}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
