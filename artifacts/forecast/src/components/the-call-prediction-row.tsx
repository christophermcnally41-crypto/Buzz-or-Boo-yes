import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCategoryLabel } from "@/lib/categories";
import { useGetMarketTally, getGetMarketTallyQueryKey } from "@workspace/api-client-react";

interface TheCallOption {
  key: string;
  label: string;
}

interface TheCallData {
  options: TheCallOption[];
  context?: string;
}

function parseTheCallData(desc: string | null | undefined): TheCallData | null {
  if (!desc) return null;
  try {
    const p = JSON.parse(desc);
    if (Array.isArray(p.options)) return p as TheCallData;
  } catch {}
  return null;
}

interface UserPredictionLike {
  id: number;
  marketId: number;
  choice: string;
  amount: number;
  tokensEarned?: number | null;
  createdAt: string;
  isCorrect?: boolean | null;
  market?: {
    id?: number;
    question?: string;
    category?: string;
    description?: string | null;
    status?: string;
    marketFormat?: string;
    resolvedOutcome?: string | null;
  } | null;
}

interface TheCallPredictionRowProps {
  prediction: UserPredictionLike;
}

export function TheCallPredictionRow({ prediction }: TheCallPredictionRowProps) {
  const { data: tallyData } = useGetMarketTally(prediction.marketId, {
    query: { queryKey: getGetMarketTallyQueryKey(prediction.marketId) },
  });

  const theCallData = parseTheCallData(prediction.market?.description);

  const pickedLabel =
    theCallData?.options.find((o) => o.key === prediction.choice)?.label ??
    prediction.choice;

  // Determine the leading option from tally
  let leadingLabel: string | null = null;
  let tallyHasAnyVotes = false;
  if (tallyData?.tallies && theCallData) {
    let maxCount = 0;
    let leadingKey: string | null = null;
    for (const [key, count] of Object.entries(tallyData.tallies)) {
      if (count > 0) tallyHasAnyVotes = true;
      if (count > maxCount) {
        maxCount = count;
        leadingKey = key;
      }
    }
    if (leadingKey && maxCount > 0) {
      leadingLabel =
        theCallData.options.find((o) => o.key === leadingKey)?.label ?? leadingKey;
    }
  }

  const isResolved = prediction.market?.status === "RESOLVED";
  const won = isResolved && prediction.isCorrect;
  const resolvedOutcome = prediction.market?.resolvedOutcome;
  const winnerLabel = isResolved && resolvedOutcome && theCallData
    ? (theCallData.options.find(o => o.key === resolvedOutcome)?.label ?? resolvedOutcome)
    : null;

  return (
    <Card className="overflow-hidden hover:border-primary/30 transition-colors">
      <Link href={`/markets/${prediction.marketId}`}>
        <div className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex-1 min-w-0">
            {/* Category + date row */}
            <div className="flex items-center gap-2 mb-2 text-xs font-medium">
              <span className="text-2xl leading-none" aria-hidden>🎯</span>
              <span className="text-muted-foreground">
                {getCategoryLabel(prediction.market?.category ?? "")}
              </span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="text-muted-foreground">
                {new Date(prediction.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h4 className="font-editorial font-semibold text-lg line-clamp-2 leading-tight">
              {prediction.market?.question}
            </h4>
          </div>

          <div className="flex items-center gap-6 md:min-w-[220px] justify-between md:justify-end shrink-0 w-full md:w-auto">
            {/* Staked amount */}
            <div className="flex flex-col items-start md:items-end">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Staked
              </span>
              <span className="text-sm font-mono-numbers font-bold text-foreground">
                {prediction.amount.toLocaleString()} FP
              </span>
            </div>

            {/* My Pick */}
            <div className="flex flex-col items-start md:items-end">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                My Pick
              </span>
              <Badge
                variant="secondary"
                className={
                  isResolved
                    ? won
                      ? "bg-green-600 text-white hover:bg-green-700 border-transparent"
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-transparent"
                    : ""
                }
              >
                {pickedLabel}
              </Badge>
            </div>

            {/* Crowd Favorite / Result */}
            <div className="flex flex-col items-end min-w-[90px]">
              {isResolved ? (
                <>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Result
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      won ? "text-green-600" : "text-destructive"
                    }`}
                  >
                    {won ? "Called It! ✓" : "Missed"}
                  </span>
                  {prediction.tokensEarned != null && (
                    <span className={`text-xs font-bold mt-0.5 ${won ? "text-green-500" : "text-red-400"}`}>
                      {won ? `+${prediction.tokensEarned}` : `-${prediction.amount}`} FP
                    </span>
                  )}
                  {winnerLabel && (
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      🏆 {winnerLabel}
                    </span>
                  )}
                </>
              ) : leadingLabel ? (
                <>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Crowd Favorite
                  </span>
                  <span className="text-xs font-semibold text-foreground truncate max-w-[90px]">
                    {leadingLabel}
                  </span>
                </>
              ) : tallyData && !tallyHasAnyVotes ? (
                <>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Status
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-secondary text-secondary-foreground border-transparent text-xs"
                  >
                    No picks yet
                  </Badge>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Status
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-secondary text-secondary-foreground border-transparent text-xs"
                  >
                    In Play
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
}
