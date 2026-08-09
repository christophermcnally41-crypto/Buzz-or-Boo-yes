import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { 
  useGetMarket, 
  useGetMarketPredictions, 
  useMakePrediction,
  getGetMarketQueryKey,
  getGetMarketPredictionsQueryKey,
  getGetMeQueryKey,
  getGetPlatformStatsQueryKey,
  getGetUserPredictionsQueryKey
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { getCategoryLabel, getCategoryIcon } from "@/lib/categories";
import { formatNumber, cn } from "@/lib/utils";
import { getMarketColors } from "@/lib/market-colors";
import { ArrowLeft, Clock, Info, CheckCircle2, XCircle, LogIn, Crown } from "lucide-react";
import { Link } from "wouter";

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

function parseMultiChoiceData(desc: string | null | undefined): MultiChoiceData | null {
  if (!desc) return null;
  try {
    const p = JSON.parse(desc);
    if (Array.isArray(p.contenders)) return p as MultiChoiceData;
  } catch {}
  return null;
}

const CONTENDER_COLORS = ["#CFEA3B", "#3ECDE8", "#E87B3E", "#8B5CF6", "#EC4899"];

export default function MarketDetail() {
  const params = useParams();
  const marketId = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: authUser, isAuthenticated, login } = useAuth();

  const { data: market, isLoading } = useGetMarket(marketId, {
    query: { enabled: !!marketId, queryKey: getGetMarketQueryKey(marketId) }
  });

  const { data: predictions } = useGetMarketPredictions(marketId, {
    query: { enabled: !!marketId, queryKey: getGetMarketPredictionsQueryKey(marketId) }
  });

  const makePrediction = useMakePrediction();

  const [amount, setAmount] = useState([100]);
  const [isPredicting, setIsPredicting] = useState<string | null>(null);

  const isResolved = market?.status === "RESOLVED";
  const isClosed = market?.status === "CLOSED" || isResolved;
  const isMultiChoice = market?.marketFormat === "MULTI_CHOICE";

  const multiChoiceData = isMultiChoice ? parseMultiChoiceData(market?.description) : null;

  // Compute per-contender vote counts from predictions
  const contenderCounts = useMemo(() => {
    if (!multiChoiceData || !predictions) return {};
    const counts: Record<string, number> = {};
    for (const c of multiChoiceData.contenders) counts[c.key] = 0;
    for (const p of predictions) {
      if (p.choice in counts) counts[p.choice]++;
    }
    return counts;
  }, [multiChoiceData, predictions]);

  const totalContenderVotes = Object.values(contenderCounts).reduce((a, b) => a + b, 0);

  const handlePredict = (choice: string) => {
    if (!isAuthenticated || !authUser) {
      login();
      return;
    }

    setIsPredicting(choice);
    makePrediction.mutate({
      id: marketId,
      data: {
        userId: parseInt(authUser.id, 10),
        choice,
        amount: amount[0]
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Prediction Cast!",
          description: `You placed ${formatNumber(amount[0])} points on ${choice}.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetMarketQueryKey(marketId) });
        queryClient.invalidateQueries({ queryKey: getGetMarketPredictionsQueryKey(marketId) });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        if (authUser) queryClient.invalidateQueries({ queryKey: getGetUserPredictionsQueryKey(parseInt(authUser.id, 10)) });
        queryClient.invalidateQueries({ queryKey: getGetPlatformStatsQueryKey() });
        setIsPredicting(null);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || "Failed to cast prediction.";
        toast({ title: "Error", description: msg, variant: "destructive" });
        setIsPredicting(null);
      }
    });
  };

  const userPrediction = useMemo(() => {
    if (!predictions || !authUser) return null;
    const uid = parseInt(authUser.id, 10);
    return predictions.find(p => p.userId === uid) ?? null;
  }, [predictions, authUser]);

  const userTotalInvested = userPrediction?.amount ?? 0;

  if (isLoading || !market) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="font-editorial text-xl font-medium text-muted-foreground">Loading Market...</p>
        </div>
      </div>
    );
  }

  const yesPercent = market.yesPercent || 50;
  const noPercent = market.noPercent || 50;
  const colors = getMarketColors(market.id);

  return (
    <div className="min-h-screen pb-24">
      {market.imageUrl && (
        <div className="w-full h-[40vh] relative">
          <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>
      )}

      <div className={cn(
        "container mx-auto px-4 relative z-10",
        market.imageUrl ? "-mt-32" : "pt-8"
      )}>
        <Link href="/markets" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Markets
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Main Content */}
          <div className="lg:col-span-8">
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="secondary" className="font-medium gap-1.5 py-1 px-3">
                {getCategoryIcon(market.category)} {getCategoryLabel(market.category)}
              </Badge>
              <span className="text-muted-foreground text-sm font-medium">— {market.subcategory}</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-editorial font-bold leading-[1.1] text-balance mb-6">
              {market.question}
            </h1>

            {market.description && !isMultiChoice && (
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-3xl">
                {market.description}
              </p>
            )}

            {/* MULTI-CHOICE: Contender leaderboard */}
            {isMultiChoice && multiChoiceData ? (
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-5 h-5 text-primary" />
                  <h2 className="font-editorial text-2xl font-bold">The Race</h2>
                </div>
                {multiChoiceData.metric && (
                  <p className="text-muted-foreground text-sm mb-6">{multiChoiceData.metric} · {multiChoiceData.period}</p>
                )}

                <div className="space-y-4">
                  {multiChoiceData.contenders.map((c, i) => {
                    const count = contenderCounts[c.key] ?? 0;
                    const pct = totalContenderVotes > 0 ? Math.round((count / totalContenderVotes) * 100) : Math.floor(100 / multiChoiceData.contenders.length);
                    const color = CONTENDER_COLORS[i % CONTENDER_COLORS.length];
                    const isWinner = isResolved && market.resolvedOutcome === c.key;

                    return (
                      <div key={c.key} className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl transition-all",
                        isWinner ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
                      )}>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-editorial font-bold text-lg flex items-center gap-2">
                              {isWinner && <Crown className="w-4 h-4 text-primary" />}
                              {c.name}
                              {c.venue && <span className="text-xs font-normal text-muted-foreground font-sans">{c.venue}</span>}
                            </span>
                            <span className="font-mono-numbers font-bold text-sm" style={{ color }}>
                              {pct}%
                            </span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-1000"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">{count} predictions</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* STANDARD: Giant Probability Display */
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
                  <div className="flex-1 text-center md:text-left">
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2 flex items-baseline justify-center md:justify-start" style={{ color: colors.yes }}>
                      {yesPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ color: colors.yes, opacity: 0.6 }}>%</span>
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider text-muted-foreground">YES PROBABILITY</div>
                  </div>
                  <div className="hidden md:flex text-4xl text-muted-foreground/30 font-editorial font-light">vs</div>
                  <div className="flex-1 text-center md:text-right">
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2 flex items-baseline justify-center md:justify-end" style={{ color: colors.no }}>
                      {noPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ color: colors.no, opacity: 0.6 }}>%</span>
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider text-muted-foreground">NO PROBABILITY</div>
                  </div>
                </div>

                <div className="h-4 w-full bg-secondary rounded-full overflow-hidden flex relative">
                  <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${yesPercent}%`, backgroundColor: colors.yes }} />
                  <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${noPercent}%`, backgroundColor: colors.no }} />
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-background z-20 -ml-[1px]" />
                </div>
                <div className="flex justify-between mt-3 text-sm font-mono-numbers text-muted-foreground">
                  <span>{formatNumber(market.yesCount)} points</span>
                  <span>{formatNumber(market.noCount)} points</span>
                </div>
              </div>
            )}

            {/* Market Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/40 p-4 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold mb-1">Resolution Source</div>
                  <div className="text-sm text-muted-foreground">{market.resolutionSource || "Platform Admin Review"}</div>
                </div>
              </div>
              <div className="bg-muted/40 p-4 rounded-xl flex items-start gap-3">
                <Clock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold mb-1">Status</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    {isResolved ? (
                      <span className="flex items-center text-foreground font-medium">
                        Resolved — {market.resolvedOutcome}
                      </span>
                    ) : isClosed ? (
                      <span className="text-orange-500 font-medium">Closed for predictions</span>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Closes {market.closesAt ? new Date(market.closesAt).toLocaleDateString() : 'TBD'}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar — Action Area */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="sticky top-24 border-primary/20 shadow-lg">
              <CardContent className="p-6">
                <h3 className="font-editorial text-2xl font-bold mb-6">Make a Forecast</h3>

                {/* Not authenticated */}
                {!isAuthenticated && !isClosed && (
                  <div className="text-center py-6 bg-muted/50 rounded-xl border border-dashed border-border mb-4">
                    <LogIn className="w-8 h-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="font-medium mb-1">Log in to predict</p>
                    <p className="text-sm text-muted-foreground mb-4">You need an account to place Forecast Points.</p>
                    <Button onClick={login} className="rounded-full px-6">Log in</Button>
                  </div>
                )}

                {/* Already predicted */}
                {isAuthenticated && userPrediction && (
                  <div className="mb-4 p-4 bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-sm font-bold text-primary mb-1">Your prediction</p>
                    <p className="font-mono-numbers font-bold">
                      {userPrediction.choice} · {formatNumber(userPrediction.amount)} FP
                    </p>
                  </div>
                )}

                {isClosed ? (
                  <div className="text-center py-6 bg-muted/50 rounded-xl border border-dashed border-border">
                    <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="font-medium">Market is closed.</p>
                    {isResolved && (
                      <Badge variant="default" className="mt-3 text-base px-4 py-1">
                        Outcome: {market.resolvedOutcome}
                      </Badge>
                    )}
                  </div>
                ) : isAuthenticated && !userPrediction ? (
                  <>
                    <div className="mb-6">
                      <div className="flex justify-between items-end mb-4">
                        <label className="text-sm font-bold tracking-tight">Amount to Predict</label>
                        <span className="font-mono-numbers text-2xl font-bold text-primary">
                          {formatNumber(amount[0])} <span className="text-sm text-muted-foreground font-sans">FP</span>
                        </span>
                      </div>
                      <Slider
                        value={amount}
                        onValueChange={setAmount}
                        max={500}
                        min={10}
                        step={10}
                        className="py-4"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground font-mono-numbers mt-2">
                        <span>10</span>
                        <span>500</span>
                      </div>
                    </div>

                    {/* Multi-choice: contender buttons */}
                    {isMultiChoice && multiChoiceData ? (
                      <div className="space-y-2">
                        {multiChoiceData.contenders.map((c, i) => (
                          <Button
                            key={c.key}
                            size="lg"
                            className="w-full h-12 text-base rounded-xl border-0 font-bold transition-transform hover:-translate-y-0.5"
                            style={{
                              backgroundColor: CONTENDER_COLORS[i % CONTENDER_COLORS.length],
                              color: i === 0 ? "#1a1a1a" : "#fff",
                            }}
                            onClick={() => handlePredict(c.key)}
                            disabled={isPredicting !== null}
                          >
                            {isPredicting === c.key ? "Casting..." : c.name}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      /* Standard YES/NO buttons */
                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          size="lg"
                          className="h-16 text-xl rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0"
                          style={{ backgroundColor: colors.yes, color: "#fff", boxShadow: `0 8px 24px ${colors.yesSoft}` }}
                          onClick={() => handlePredict("YES")}
                          disabled={isPredicting !== null}
                        >
                          {isPredicting === "YES" ? "Casting..." : "Vote YES"}
                        </Button>
                        <Button
                          size="lg"
                          className="h-16 text-xl rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0"
                          style={{ backgroundColor: colors.no, color: "#fff", boxShadow: `0 8px 24px ${colors.noSoft}` }}
                          onClick={() => handlePredict("NO")}
                          disabled={isPredicting !== null}
                        >
                          {isPredicting === "NO" ? "Casting..." : "Vote NO"}
                        </Button>
                      </div>
                    )}
                  </>
                ) : null}

                {userTotalInvested > 0 && (
                  <div className="mt-6 pt-6 border-t border-border/50 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Your total position</p>
                    <p className="font-mono-numbers font-bold text-xl">{formatNumber(userTotalInvested)} FP</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-editorial text-xl font-bold mb-4">Recent Activity</h3>
                <div className="space-y-4">
                  {!predictions || predictions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No predictions yet. Be the first!</p>
                  ) : (
                    predictions.slice(0, 5).map(pred => {
                      const contenderName = isMultiChoice && multiChoiceData
                        ? multiChoiceData.contenders.find(c => c.key === pred.choice)?.name ?? pred.choice
                        : pred.choice;
                      const isYes = pred.choice === 'YES';
                      return (
                        <div key={pred.id} className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-2 font-medium">
                            {!isMultiChoice ? (
                              isYes ? (
                                <CheckCircle2 className="w-4 h-4" style={{ color: colors.yes }} />
                              ) : (
                                <XCircle className="w-4 h-4" style={{ color: colors.no }} />
                              )
                            ) : (
                              <Crown className="w-4 h-4 text-primary" />
                            )}
                            User #{pred.userId} → {contenderName}
                          </div>
                          <div className="font-mono-numbers font-bold">{formatNumber(pred.amount)}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
