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
import { Trophy, Activity, CheckCircle2, XCircle, Pin, Zap, Link2, Check, ArrowRight, UserX } from "lucide-react";
import { Link } from "wouter";
import { getCategoryLabel } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { BuzzOrBooCard } from "@/components/buzz-or-boo-card";
import { TheCallCard } from "@/components/the-call-card";
import { MultiChoiceCard } from "@/components/multi-choice-card";
import { HeadToHeadCard } from "@/components/head-to-head-card";
import { HotOrNotCard } from "@/components/hot-or-not-card";
import { TheCallPredictionRow } from "@/components/the-call-prediction-row";

const TOPUP_THRESHOLD = 500;

type Tab = "calls" | "pins";

export default function Profile() {
  const params = useParams();
  const userId = parseInt(params.id || "1", 10);
  const [tab, setTab] = useState<Tab>("calls");
  const [copied, setCopied] = useState(false);
  const { user: authUser, isAuthenticated } = useAuth();

  const handleCopyProfileLink = () => {
    const url = `${window.location.origin}/profile/${userId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4 max-w-sm px-4">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
            <UserX className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-editorial font-bold">Forecaster not found</h2>
          <p className="text-muted-foreground text-sm">This profile doesn't exist or may have been removed.</p>
          <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-semibold">
            ← Back to leaderboard
          </Link>
        </div>
      </div>
    );
  }

  // Category accuracy stored as fraction 0–1; convert to 0–100 for BuzzScore display
  const toBuzzScore = (v: number | null | undefined) =>
    v != null ? Math.round(v * 100) : null;

  const accuracyData = [
    { label: "Overall", value: user.buzzScore ?? toBuzzScore(user.overallAccuracy) },
    { label: "Style", value: toBuzzScore(user.styleAccuracy) },
    { label: "Home", value: toBuzzScore(user.homeAccuracy) },
    { label: "City", value: toBuzzScore(user.cityAccuracy) },
    { label: "Culture", value: toBuzzScore(user.cultureAccuracy) },
  ].filter(d => d.value !== undefined && d.value !== null) as { label: string; value: number }[];

  const getTierLabel = (score?: number | null) => {
    if (!score) return "Developing";
    if (score >= 80) return "Elite";
    if (score >= 65) return "Expert";
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
                {user.rank ? (
                  <Link href="/leaderboard">
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 px-3 py-1 text-sm gap-1.5 self-center hover:bg-amber-500/20 transition-colors cursor-pointer">
                      <Trophy className="w-4 h-4" /> Global Rank #{user.rank}
                    </Badge>
                  </Link>
                ) : (
                  <Badge variant="secondary" className="bg-muted text-muted-foreground border-border/40 px-3 py-1 text-sm gap-1.5 self-center">
                    <Trophy className="w-4 h-4 opacity-40" /> Unranked
                  </Badge>
                )}
                <button
                  onClick={handleCopyProfileLink}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border/50 hover:border-primary/40 rounded-full px-3 py-1.5 self-center"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-sm">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Forecast Points</span>
                  <span className="text-2xl font-mono-numbers font-bold text-primary">{formatNumber(user.tokenBalance)}</span>
                  {isOwnProfile && <span className="text-xs text-muted-foreground/60">your balance</span>}
                  {isOwnProfile && user.tokenBalance < TOPUP_THRESHOLD && meData && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                      <Zap className="w-3 h-3" />
                      Daily top-up active — resets to {TOPUP_THRESHOLD} FP
                    </span>
                  )}
                </div>
                <div className="w-px h-10 bg-border hidden md:block" />
                <button
                  className="flex flex-col text-left hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => setTab('calls')}
                  title="View prediction history"
                >
                  <span className="text-muted-foreground">Predictions</span>
                  <span className="text-2xl font-mono-numbers font-bold">{formatNumber(user.totalPredictions)}</span>
                  <span className="text-xs text-muted-foreground/60 underline decoration-dotted">total calls made</span>
                </button>
                <div className="w-px h-10 bg-border hidden md:block" />
                <a href="/leaderboard" className="flex flex-col text-left hover:opacity-80 transition-opacity cursor-pointer">
                  <span className="text-muted-foreground">BuzzScore</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono-numbers font-bold text-foreground">
                      {user.buzzScore != null
                        ? user.buzzScore
                        : user.overallAccuracy != null
                          ? Math.round(user.overallAccuracy * 100)
                          : '—'}
                    </span>
                    {(() => {
                      const score = user.buzzScore ?? (user.overallAccuracy != null ? Math.round(user.overallAccuracy * 100) : null);
                      const tier = getTierLabel(score);
                      const color = tier === 'Elite' ? 'text-amber-600 bg-amber-500/10 border-amber-500/20' : tier === 'Expert' ? 'text-blue-600 bg-blue-500/10 border-blue-500/20' : 'text-muted-foreground bg-muted border-border/40';
                      return score != null ? (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${color}`}>{tier}</span>
                      ) : null;
                    })()}
                  </div>
                  <span className="text-xs text-muted-foreground/60 underline decoration-dotted">view leaderboard →</span>
                </a>
                <div className="w-px h-10 bg-border hidden md:block" />
                <button
                  className="flex flex-col text-left hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => setTab('calls')}
                  title="View correct calls"
                >
                  <span className="text-muted-foreground">Correct</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono-numbers font-bold text-foreground">
                      {user.totalCorrect != null ? user.totalCorrect : '—'}
                    </span>
                    {user.totalCorrect != null && user.totalResolved != null && user.totalResolved > 0 && (
                      <span className="text-sm font-mono-numbers text-muted-foreground">
                        ({Math.round((user.totalCorrect / user.totalResolved) * 100)}%)
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/60 underline decoration-dotted">
                    {user.totalCorrect != null && user.totalResolved != null && user.totalResolved > 0
                      ? `of ${user.totalResolved} resolved`
                      : 'correct calls'}
                  </span>
                </button>
                <div className="w-px h-10 bg-border hidden md:block" />
                <button
                  className="flex flex-col text-left hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => setTab('pins')}
                  title="View pinned markets"
                >
                  <span className="text-muted-foreground">Pinned</span>
                  <span className="text-2xl font-mono-numbers font-bold text-foreground">{pins.length}</span>
                  <span className="text-xs text-muted-foreground/60 underline decoration-dotted">markets saved</span>
                </button>
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
                  <Activity className="w-5 h-5 text-primary" /> BuzzScore by Category
                </h3>
              </CardHeader>
              <CardContent className="space-y-5">
                {accuracyData.length > 0 ? (
                  accuracyData.map(stat => (
                    <div key={stat.label} className="space-y-2">
                      <div className="flex justify-between text-sm font-medium">
                        <span className="flex items-center gap-2">
                          {stat.label}
                          <Badge variant="outline" className={cn(
                            "text-[10px] py-0 h-4 px-1.5",
                            stat.value >= 80 ? "border-yellow-500/60 text-yellow-600 dark:text-yellow-400" :
                            stat.value >= 65 ? "border-blue-500/60 text-blue-600 dark:text-blue-400" :
                            "opacity-60"
                          )}>
                            {getTierLabel(stat.value)}
                          </Badge>
                        </span>
                        <span className="font-mono-numbers font-bold">{stat.value}</span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full transition-all duration-1000", stat.value >= 80 ? "bg-yellow-500" : stat.value >= 65 ? "bg-blue-500" : "bg-primary")}
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
                  (() => {
                    const theCallPreds = predictions.filter(p => p.market?.marketFormat === "THE_CALL");
                    const otherPreds = predictions.filter(p => p.market?.marketFormat !== "THE_CALL");
                    return (
                      <div className="space-y-10">
                        {predictions.length >= 50 && (
                          <p className="text-xs text-muted-foreground text-center pb-2">
                            Showing your most recent 50 calls
                          </p>
                        )}
                        {/* The Call section */}
                        {theCallPreds.length > 0 && (
                          <div>
                            <h3 className="font-editorial text-lg font-bold flex items-center gap-2 mb-4">
                              <span aria-hidden>🎯</span> The Call
                              <span className="text-xs font-mono-numbers text-muted-foreground font-normal ml-1">
                                {theCallPreds.length}
                              </span>
                            </h3>
                            <div className="space-y-4">
                              {theCallPreds.map(pred => (
                                <TheCallPredictionRow key={pred.id} prediction={pred} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Forecast / Buzz or Boo / HOT_OR_NOT / MULTI_CHOICE section */}
                        {otherPreds.length > 0 && (
                          <div>
                            <h3 className="font-editorial text-lg font-bold flex items-center gap-2 mb-4">
                              {theCallPreds.length > 0 ? 'Other Predictions' : 'My Calls'}
                              <span className="text-xs font-mono-numbers text-muted-foreground font-normal ml-1">
                                {otherPreds.length}
                              </span>
                            </h3>
                            <div className="space-y-4">
                              {otherPreds.map(pred => {
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
                                } else if (pred.market?.marketFormat === "HEAD_TO_HEAD" && pred.market?.description) {
                                  try {
                                    const data = JSON.parse(pred.market.description);
                                    if (pred.choice === "YES" && data.entityA) choiceLabel = data.entityA;
                                    else if (pred.choice === "NO" && data.entityB) choiceLabel = data.entityB;
                                  } catch {}
                                } else if (pred.market?.marketFormat === "HOT_OR_NOT") {
                                  choiceLabel = pred.choice === "YES" ? "🔥 HOT" : "❄️ NOT HOT";
                                } else if (pred.market?.marketFormat === "BUZZ_OR_BOO") {
                                  choiceLabel = pred.choice === "YES" ? "⚡ Buzzed It" : "👎 Boo'd It";
                                } else {
                                  choiceLabel = pred.choice === "YES" ? "✅ Yes" : pred.choice === "NO" ? "❌ No" : pred.choice;
                                }

                                return (
                                  <Card key={pred.id} className="overflow-hidden hover:border-primary/30 transition-colors">
                                    <Link href={`/markets/${pred.marketId}`}>
                                      <div className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-2 text-xs font-medium flex-wrap">
                                            <span className="text-muted-foreground">{getCategoryLabel(pred.market?.category || "")}</span>
                                            {pred.market?.marketFormat && pred.market.marketFormat !== "STANDARD" && (
                                              <>
                                                <span className="w-1 h-1 rounded-full bg-border" />
                                                <span className="font-semibold text-primary/70">
                                                  {pred.market.marketFormat === "BUZZ_OR_BOO" ? "⚡ Buzz or Boo"
                                                    : pred.market.marketFormat === "THE_CALL" ? "🎯 The Call"
                                                    : pred.market.marketFormat === "MULTI_CHOICE" ? "👑 Buzz Battle"
                                                    : pred.market.marketFormat === "HOT_OR_NOT" ? "🔥 Hot or Not"
                                                    : pred.market.marketFormat === "HEAD_TO_HEAD" ? "⚔️ Head to Head"
                                                    : pred.market.marketFormat}
                                                </span>
                                              </>
                                            )}
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
                                              variant={
                                                isMultiChoice
                                                  ? (isResolved ? 'secondary' : 'secondary')
                                                  : (pred.choice === 'YES' ? 'default' : pred.choice === 'NO' ? 'destructive' : 'secondary')
                                              }
                                              className={cn(
                                                "font-mono-numbers",
                                                isMultiChoice && isResolved && won && "bg-green-600 text-white hover:bg-green-700 border-transparent",
                                                isMultiChoice && isResolved && !won && "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-transparent",
                                              )}
                                            >
                                              {choiceLabel} · {formatNumber(pred.amount)} FP
                                            </Badge>
                                          </div>
                                          
                                          <div className="flex flex-col items-end min-w-[80px]">
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Result</span>
                                            {isResolved ? (
                                              <>
                                                <div className={cn("flex items-center gap-1 font-bold text-sm", won ? "text-green-600" : "text-destructive")}>
                                                  {won ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                                  {won
                                                    ? (pred.tokensEarned != null ? `Called It! +${formatNumber(pred.tokensEarned)} FP` : "Called It! ✓")
                                                    : `-${formatNumber(pred.amount)} FP`}
                                                </div>
                                                {(() => {
                                                  const outcome = (pred.market as any)?.resolvedOutcome as string | null | undefined;
                                                  if (!outcome) return null;
                                                  const fmt = pred.market?.marketFormat;
                                                  let outcomeLabel: string = outcome;
                                                  if (fmt === 'BUZZ_OR_BOO') outcomeLabel = outcome === 'YES' ? '⚡ BUZZ' : '👎 BOO';
                                                  else if (fmt === 'HOT_OR_NOT') outcomeLabel = outcome === 'YES' ? '🔥 HOT' : '❄️ NOT HOT';
                                                  else if (fmt === 'THE_CALL' && pred.market?.description) {
                                                    try { const d = JSON.parse(pred.market.description); outcomeLabel = d.options?.find((o: any) => o.key === outcome)?.label ?? outcome; } catch {}
                                                  } else if (fmt === 'MULTI_CHOICE' && pred.market?.description) {
                                                    try { const d = JSON.parse(pred.market.description); outcomeLabel = d.contenders?.find((c: any) => c.key === outcome)?.name ?? outcome; } catch {}
                                                  } else if (fmt === 'HEAD_TO_HEAD' && pred.market?.description) {
                                                    try { const d = JSON.parse(pred.market.description); outcomeLabel = outcome === 'YES' ? (d.entityA ?? outcome) : (d.entityB ?? outcome); } catch {}
                                                  } else {
                                                    outcomeLabel = outcome === 'YES' ? '✅ Yes' : outcome === 'NO' ? '❌ No' : outcome;
                                                  }
                                                  return <span className="text-[10px] text-muted-foreground mt-0.5">Outcome: {outcomeLabel}</span>;
                                                })()}
                                              </>
                                            ) : (
                                              <div className="flex flex-col items-end gap-0.5">
                                                {(pred.market as any)?.status === 'CLOSED' ? (
                                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                                                    Closed
                                                  </Badge>
                                                ) : (pred.market as any)?.status === 'SCHEDULED' ? (
                                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]">
                                                    Upcoming
                                                  </Badge>
                                                ) : (
                                                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                                                    Open
                                                  </Badge>
                                                )}
                                                {(pred.market as any)?.closesAt && (pred.market as any)?.status === 'OPEN' && (
                                                  <span className="text-[9px] text-muted-foreground/60">
                                                    Closes {new Date((pred.market as any).closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date((pred.market as any).closesAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </Link>
                                  </Card>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-border flex flex-col items-center gap-3">
                    <span className="text-4xl">🎯</span>
                    <p className="text-foreground font-bold text-lg">No calls made yet.</p>
                    <p className="text-muted-foreground text-sm max-w-xs">Jump in and make your first prediction — every call counts toward your BuzzScore.</p>
                    <Link href="/markets">
                      <Button size="sm" variant="outline" className="rounded-full mt-1 gap-1.5">
                        Browse markets <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
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
                      market.marketFormat === "BUZZ_OR_BOO"
                        ? <BuzzOrBooCard key={market.id} market={market as any} />
                        : market.marketFormat === "THE_CALL"
                          ? <TheCallCard key={market.id} market={market as any} />
                          : market.marketFormat === "MULTI_CHOICE"
                            ? <MultiChoiceCard key={market.id} market={market as any} />
                            : market.marketFormat === "HEAD_TO_HEAD"
                              ? <HeadToHeadCard key={market.id} market={market as any} />
                              : market.marketFormat === "HOT_OR_NOT"
                                ? <HotOrNotCard key={market.id} market={market as any} />
                                : <MarketCard key={market.id} market={market as any} />
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
