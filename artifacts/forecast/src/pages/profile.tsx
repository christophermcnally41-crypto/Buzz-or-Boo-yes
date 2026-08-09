import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetUser,
  useGetUserPredictions,
  useGetUserPins,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, cn } from "@/lib/utils";
import { Trophy, Activity, CheckCircle2, XCircle, Pin, Zap } from "lucide-react";
import { Link } from "wouter";
import { getCategoryLabel } from "@/lib/categories";
import { MarketCard } from "@/components/market-card";

const TOPUP_THRESHOLD = 500;

type Tab = "calls" | "pins";

export default function Profile() {
  const params = useParams();
  const userId = parseInt(params.id || "1", 10);
  const [tab, setTab] = useState<Tab>("calls");
  const { user: authUser, isAuthenticated } = useAuth();

  const { data: user, isLoading: loadingUser } = useGetUser(userId);
  const { data: predictions, isLoading: loadingPredictions } = useGetUserPredictions(userId);
  const { data: pinsData, isLoading: loadingPins } = useGetUserPins(userId);

  // Fetch /users/me to get top-up badge data (own profile only)
  const isOwnProfile = isAuthenticated && authUser && parseInt(authUser.id, 10) === userId;
  const { data: meData } = useGetMe({
    query: { enabled: !!isOwnProfile, queryKey: getGetMeQueryKey() },
  });

  if (loadingUser) {
    return <div className="min-h-screen flex items-center justify-center animate-pulse text-muted-foreground">Loading Profile...</div>;
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">User not found</div>;
  }

  const accuracyData = [
    { label: "Overall", value: user.overallAccuracy },
    { label: "Style", value: user.styleAccuracy },
    { label: "Home", value: user.homeAccuracy },
    { label: "City", value: user.cityAccuracy },
    { label: "Culture", value: user.cultureAccuracy },
  ].filter(d => d.value !== undefined && d.value !== null);

  const getTierLabel = (acc?: number | null) => {
    if (!acc) return "Developing";
    if (acc >= 80) return "Elite";
    if (acc >= 65) return "Expert";
    return "Developing";
  };

  const pins = pinsData?.pins ?? [];

  return (
    <div className="min-h-screen pb-24">
      {/* Profile Header */}
      <div className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            <Avatar className="w-32 h-32 md:w-40 md:h-40 border-4 border-background shadow-xl">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback className="text-4xl bg-primary/10 text-primary font-editorial font-bold">
                {user.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="text-center md:text-left flex-1">
              <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
                <h1 className="text-4xl font-editorial font-bold">{user.username}</h1>
                {user.rank && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 px-3 py-1 text-sm gap-1.5 self-center">
                    <Trophy className="w-4 h-4" /> Global Rank #{user.rank}
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-sm">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Forecast Points</span>
                  <span className="text-2xl font-mono-numbers font-bold text-primary">{formatNumber(user.tokenBalance)}</span>
                  {isOwnProfile && user.tokenBalance < TOPUP_THRESHOLD && meData && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                      <Zap className="w-3 h-3" />
                      Daily top-up active — resets to {TOPUP_THRESHOLD} FP
                    </span>
                  )}
                </div>
                <div className="w-px h-10 bg-border hidden md:block" />
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Predictions</span>
                  <span className="text-2xl font-mono-numbers font-bold">{formatNumber(user.totalPredictions)}</span>
                </div>
                <div className="w-px h-10 bg-border hidden md:block" />
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Accuracy</span>
                  <span className="text-2xl font-mono-numbers font-bold text-foreground">
                    {user.overallAccuracy ? `${user.overallAccuracy.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="w-px h-10 bg-border hidden md:block" />
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Pinned</span>
                  <span className="text-2xl font-mono-numbers font-bold text-foreground">{pins.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Stats */}
          <div className="lg:col-span-1 space-y-8">
            <Card>
              <CardHeader className="pb-4">
                <h3 className="font-editorial text-xl font-bold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" /> Category Accuracy
                </h3>
              </CardHeader>
              <CardContent className="space-y-5">
                {accuracyData.length > 0 ? (
                  accuracyData.map(stat => (
                    <div key={stat.label} className="space-y-2">
                      <div className="flex justify-between text-sm font-medium">
                        <span className="flex items-center gap-2">
                          {stat.label}
                          <Badge variant="outline" className="text-[10px] py-0 h-4 px-1.5 opacity-60">
                            {getTierLabel(stat.value)}
                          </Badge>
                        </span>
                        <span className="font-mono-numbers font-bold">{stat.value?.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all duration-1000"
                          style={{ width: `${stat.value}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Not enough data to calculate category accuracy.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Tabs */}
          <div className="lg:col-span-2">
            {/* Tab switcher */}
            <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-full w-fit mb-8 border border-border/50">
              <button
                onClick={() => setTab("calls")}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all",
                  tab === "calls"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                My Calls
                <span className="text-[10px] font-mono-numbers opacity-70">{predictions?.length ?? 0}</span>
              </button>
              <button
                onClick={() => setTab("pins")}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all",
                  tab === "pins"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Pin className="w-3.5 h-3.5" />
                Pinned
                <span className="text-[10px] font-mono-numbers opacity-70">{pins.length}</span>
              </button>
            </div>

            {/* MY CALLS */}
            {tab === "calls" && (
              <>
                {loadingPredictions ? (
                  <div className="space-y-4">
                    {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
                  </div>
                ) : predictions && predictions.length > 0 ? (
                  <div className="space-y-4">
                    {predictions.map(pred => {
                      const isResolved = pred.market?.status === "RESOLVED";
                      const won = isResolved && pred.isCorrect;
                      const isMultiChoice = pred.market?.marketFormat === "MULTI_CHOICE";

                      let choiceLabel: string = pred.choice as string;
                      if (isMultiChoice && pred.market?.description) {
                        try {
                          const data = JSON.parse(pred.market.description);
                          const contender = data.contenders?.find((c: { key: string; name: string }) => c.key === pred.choice);
                          if (contender) choiceLabel = contender.name;
                        } catch {}
                      } else if (pred.choice === "YES") {
                        choiceLabel = "Buzzed It";
                      } else if (pred.choice === "NO") {
                        choiceLabel = "Boo'd It";
                      }

                      return (
                        <Card key={pred.id} className="overflow-hidden hover:border-primary/30 transition-colors">
                          <Link href={`/markets/${pred.marketId}`}>
                            <div className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2 text-xs font-medium">
                                  <span className="text-muted-foreground">{getCategoryLabel(pred.market?.category || "")}</span>
                                  <span className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-muted-foreground">{new Date(pred.createdAt).toLocaleDateString()}</span>
                                </div>
                                <h4 className="font-editorial font-semibold text-lg line-clamp-2 leading-tight">
                                  {pred.market?.question}
                                </h4>
                              </div>
                              
                              <div className="flex items-center gap-6 md:min-w-[200px] justify-between md:justify-end shrink-0 w-full md:w-auto">
                                <div className="flex flex-col items-start md:items-end">
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">My Call</span>
                                  <Badge
                                    variant={pred.choice === 'YES' ? 'default' : pred.choice === 'NO' ? 'destructive' : 'secondary'}
                                    className="font-mono-numbers"
                                  >
                                    {choiceLabel} · {formatNumber(pred.amount)} FP
                                  </Badge>
                                </div>
                                
                                <div className="flex flex-col items-end min-w-[80px]">
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Result</span>
                                  {isResolved ? (
                                    <div className={cn("flex items-center gap-1 font-bold text-sm", won ? "text-green-600" : "text-destructive")}>
                                      {won ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                      {won ? `Called It! +${formatNumber(pred.tokensEarned || 0)}` : `-${formatNumber(pred.amount)}`}
                                    </div>
                                  ) : (
                                    <Badge variant="outline" className="bg-secondary text-secondary-foreground border-transparent">
                                      In Play
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Link>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-border">
                    <p className="text-muted-foreground font-medium">No predictions made yet.</p>
                  </div>
                )}
              </>
            )}

            {/* PINNED */}
            {tab === "pins" && (
              <>
                {loadingPins ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="h-64 bg-muted animate-pulse rounded-xl" />)}
                  </div>
                ) : pins.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-[280px]">
                    {pins.map(market => (
                      <MarketCard key={market.id} market={market as any} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-border flex flex-col items-center gap-3">
                    <Pin className="w-10 h-10 text-muted-foreground/40" />
                    <p className="font-editorial text-xl font-bold">Nothing pinned yet</p>
                    <p className="text-muted-foreground text-sm max-w-xs">
                      Open any market and hit the pin icon to save it here. Great for tracking calls you're watching closely.
                    </p>
                    <Link href="/markets">
                      <button className="mt-2 px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                        Browse Markets
                      </button>
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
