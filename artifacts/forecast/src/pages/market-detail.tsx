import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { 
  useGetMarket, 
  useGetMarketPredictions, 
  useMakePrediction,
  useGetMe,
  getGetMarketQueryKey,
  getGetMarketPredictionsQueryKey,
  getGetMeQueryKey,
  getGetPlatformStatsQueryKey,
  getGetUserPredictionsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { getCategoryLabel, getCategoryIcon } from "@/lib/categories";
import { formatNumber, cn } from "@/lib/utils";
import { getMarketColors } from "@/lib/market-colors";
import { ArrowLeft, Clock, Info, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "wouter";

export default function MarketDetail() {
  const params = useParams();
  const marketId = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: market, isLoading } = useGetMarket(marketId, {
    query: { enabled: !!marketId, queryKey: getGetMarketQueryKey(marketId) }
  });

  const { data: predictions } = useGetMarketPredictions(marketId, {
    query: { enabled: !!marketId, queryKey: getGetMarketPredictionsQueryKey(marketId) }
  });

  const { data: user } = useGetMe({
    query: { queryKey: getGetMeQueryKey() }
  });

  const makePrediction = useMakePrediction();

  const [amount, setAmount] = useState([100]);
  const [isPredicting, setIsPredicting] = useState<"YES" | "NO" | null>(null);

  const isResolved = market?.status === "RESOLVED";
  const isClosed = market?.status === "CLOSED" || isResolved;

  const handlePredict = (choice: "YES" | "NO") => {
    if (!user || user.id !== 1) return;
    
    if (user.tokenBalance < amount[0]) {
      toast({
        title: "Insufficient points",
        description: "You don't have enough Forecast Points to make this prediction.",
        variant: "destructive"
      });
      return;
    }

    setIsPredicting(choice);

    makePrediction.mutate({
      id: marketId,
      data: {
        userId: user.id, // MVP demo user
        choice,
        amount: amount[0]
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Prediction Cast!",
          description: `You placed ${formatNumber(amount[0])} points on ${choice}.`,
        });
        
        // Invalidate to refresh balances and market stats
        queryClient.invalidateQueries({ queryKey: getGetMarketQueryKey(marketId) });
        queryClient.invalidateQueries({ queryKey: getGetMarketPredictionsQueryKey(marketId) });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUserPredictionsQueryKey(user.id) });
        queryClient.invalidateQueries({ queryKey: getGetPlatformStatsQueryKey() });
        
        setIsPredicting(null);
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to cast prediction. Please try again.",
          variant: "destructive"
        });
        setIsPredicting(null);
      }
    });
  };

  const userTotalInvested = useMemo(() => {
    if (!predictions || !user) return 0;
    return predictions
      .filter(p => p.userId === user.id)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [predictions, user]);

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
      {/* Editorial Header Image (if exists) */}
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

            {market.description && (
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-3xl">
                {market.description}
              </p>
            )}

            {/* Giant Probability Display */}
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

              {/* Animated Bar */}
              <div className="h-4 w-full bg-secondary rounded-full overflow-hidden flex relative">
                <div
                  className="h-full transition-all duration-1000 ease-out relative z-10"
                  style={{ width: `${yesPercent}%`, backgroundColor: colors.yes }}
                />
                <div
                  className="h-full transition-all duration-1000 ease-out relative z-10"
                  style={{ width: `${noPercent}%`, backgroundColor: colors.no }}
                />
                {/* Center marker */}
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-background z-20 -ml-[1px]" />
              </div>
              <div className="flex justify-between mt-3 text-sm font-mono-numbers text-muted-foreground">
                <span>{formatNumber(market.yesCount)} points</span>
                <span>{formatNumber(market.noCount)} points</span>
              </div>
            </div>

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
                        Resolved {market.resolvedOutcome}
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

          {/* Right Sidebar - Action Area */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="sticky top-24 border-primary/20 shadow-lg">
              <CardContent className="p-6">
                <h3 className="font-editorial text-2xl font-bold mb-6">Make a Forecast</h3>
                
                {isClosed ? (
                  <div className="text-center py-6 bg-muted/50 rounded-xl border border-dashed border-border mb-6">
                    <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="font-medium">Market is closed.</p>
                    {isResolved && (
                      <Badge variant={market.resolvedOutcome === 'YES' ? 'default' : 'destructive'} className="mt-3 text-base px-4 py-1">
                        Outcome: {market.resolvedOutcome}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mb-8">
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
                        <span>Balance: {formatNumber(user?.tokenBalance || 10000)}</span>
                        <span>500</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Button
                        size="lg"
                        className="h-16 text-xl rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0"
                        style={{
                          backgroundColor: colors.yes,
                          color: "#fff",
                          boxShadow: `0 8px 24px ${colors.yesSoft}`,
                        }}
                        onClick={() => handlePredict("YES")}
                        disabled={isPredicting !== null}
                      >
                        {isPredicting === "YES" ? "Casting..." : "Vote YES"}
                      </Button>
                      <Button
                        size="lg"
                        className="h-16 text-xl rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0"
                        style={{
                          backgroundColor: colors.no,
                          color: "#fff",
                          boxShadow: `0 8px 24px ${colors.noSoft}`,
                        }}
                        onClick={() => handlePredict("NO")}
                        disabled={isPredicting !== null}
                      >
                        {isPredicting === "NO" ? "Casting..." : "Vote NO"}
                      </Button>
                    </div>
                  </>
                )}

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
                    predictions.slice(0, 5).map(pred => (
                      <div key={pred.id} className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 font-medium">
                          {pred.choice === 'YES' ? (
                            <CheckCircle2 className="w-4 h-4" style={{ color: colors.yes }} />
                          ) : (
                            <XCircle className="w-4 h-4" style={{ color: colors.no }} />
                          )}
                          User #{pred.userId} predicted {pred.choice}
                        </div>
                        <div className="font-mono-numbers font-bold">
                          {formatNumber(pred.amount)}
                        </div>
                      </div>
                    ))
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
