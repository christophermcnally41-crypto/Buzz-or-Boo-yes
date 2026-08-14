import { useState } from "react";
import { useGetLeaderboard, useGetMyLeaderboardEntry, useGetPlatformStats } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCategoryLabel, CATEGORIES } from "@/lib/categories";
import { formatNumber, cn } from "@/lib/utils";
import { Trophy, TrendingUp, Award, Medal, User } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";

export default function Leaderboard() {
  const [category, setCategory] = useState<string>("OVERALL");
  const { user } = useAuth();
  
  const { data: leaderboard, isLoading } = useGetLeaderboard({
    category: category !== "OVERALL" ? (category as any) : undefined,
    limit: 100
  }, { query: { refetchInterval: 30000 } });

  const categoryParam = category !== "OVERALL" ? (category as any) : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: myEntryData } = useGetMyLeaderboardEntry(
    { category: categoryParam },
    { query: { enabled: !!user } as any }
  );
  // 204 "no entry" maps to undefined/void at runtime; cast for safe consumption
  const myEntry = (myEntryData && typeof myEntryData === "object" ? myEntryData : undefined);

  const currentUserId = myEntry?.user?.id ?? null;
  const { data: platformStats } = useGetPlatformStats();

  /** accuracy is stored as a 0–1 fraction; buzzScore is already 0–100 */
  const toScore = (buzzScore: number | null | undefined, accuracy: number | null | undefined): number => {
    if (buzzScore != null) return buzzScore;
    if (accuracy != null) return Math.round(accuracy * 100);
    return 0;
  };

  const getTierInfo = (score: number) => {
    if (score >= 80) return { label: "Elite", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Trophy };
    if (score >= 65) return { label: "Expert", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Medal };
    return { label: "Developing", color: "bg-slate-500/10 text-slate-600 border-slate-500/20", icon: Award };
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="bg-primary/5 border-b border-border/50 pt-10 pb-8 md:pt-16 md:pb-12 overflow-hidden relative">
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-10 pointer-events-none translate-x-1/4 -translate-y-1/4">
          <Trophy className="w-full h-full" />
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <h1 className="text-4xl md:text-5xl font-editorial font-bold mb-4">BuzzRank</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-4">
            The callers who called it right. Ranked by BuzzScore across every category.
          </p>
          {platformStats && (
            <div className="flex flex-wrap gap-4 mb-8">
              {(platformStats.totalUsers ?? 0) > 0 && (
                <Link href="/leaderboard" className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity">
                  <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-base">👥</span>
                  <span><span className="font-mono-numbers font-bold text-foreground">{(platformStats.totalUsers ?? 0).toLocaleString()}</span> <span className="text-muted-foreground">forecasters</span></span>
                </Link>
              )}
              {(platformStats.openMarkets ?? 0) > 0 && (
                <Link href="/markets?status=OPEN" className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity">
                  <span className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center text-base">🟢</span>
                  <span><span className="font-mono-numbers font-bold text-foreground">{(platformStats.openMarkets ?? 0).toLocaleString()}</span> <span className="text-muted-foreground">live markets</span></span>
                </Link>
              )}
              {(platformStats.totalPredictions ?? 0) > 0 && (
                <Link href="/markets" className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity">
                  <span className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center text-base">📊</span>
                  <span><span className="font-mono-numbers font-bold text-foreground">{(platformStats.totalPredictions ?? 0).toLocaleString()}</span> <span className="text-muted-foreground">total calls</span></span>
                </Link>
              )}
            </div>
          )}

          <div className="relative">
            <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background/80 to-transparent z-10 md:hidden" />
          <Tabs value={category} onValueChange={setCategory} className="w-full overflow-x-auto hide-scrollbar">
            <TabsList className="h-auto p-1 bg-background/50 backdrop-blur-sm border border-border/50 rounded-full inline-flex min-w-max">
              <TabsTrigger 
                value="OVERALL" 
                className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                All Callers
              </TabsTrigger>
              {CATEGORIES.map(cat => (
                <TabsTrigger 
                  key={cat} 
                  value={cat}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {getCategoryLabel(cat)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 bg-muted/50 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : leaderboard && leaderboard.length > 0 ? (
          <div className="bg-card border border-border rounded-3xl shadow-sm">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/20 text-xs font-bold tracking-wider text-muted-foreground uppercase">
              <div className="col-span-2 md:col-span-1 text-center">Rank</div>
              <div className="col-span-6 md:col-span-5">Forecaster</div>
              <div className="hidden md:block md:col-span-3 text-center">Record</div>
              <div className="col-span-4 md:col-span-3 text-right pr-4">BuzzScore</div>
            </div>

            {/* Sticky "You" row */}
            {myEntry && (
              <Link href={`/profile/${myEntry.user.id}`} className="block border-b-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors sticky top-0 z-10 backdrop-blur-sm">
                <div className="grid grid-cols-12 gap-4 p-4 items-center">
                  {/* Rank */}
                  <div className="col-span-2 md:col-span-1 text-center">
                    <span className="font-editorial font-bold text-xl text-primary">
                      {myEntry.rank ?? <span className="text-sm text-muted-foreground font-medium">—</span>}
                    </span>
                    {myEntry.rank != null && myEntry.rank > 10 && (
                      <div className="text-[9px] text-muted-foreground/60 leading-none mt-0.5">{myEntry.rank - 10} from top 10</div>
                    )}
                    {myEntry.rank != null && myEntry.rank <= 10 && myEntry.rank > 3 && (
                      <div className="text-[9px] text-primary/60 leading-none mt-0.5">top 10!</div>
                    )}
                  </div>

                  {/* User */}
                  <div className="col-span-6 md:col-span-5 flex items-center gap-3">
                    <Avatar className="h-10 w-10 md:h-12 md:w-12 border-2 border-primary">
                      <AvatarImage src={myEntry.user.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary font-bold">
                        {myEntry.user.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-bold text-primary flex items-center gap-1.5">
                        {myEntry.user.username}
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 ml-1">
                          <User className="w-3 h-3 mr-1" /> You
                        </Badge>
                      </div>
                      {(() => {
                        const score = toScore(myEntry.buzzScore, myEntry.accuracy);
                        const t = getTierInfo(score);
                        const I = t.icon;
                        return (
                          <Badge variant="outline" className={cn("text-[10px] mt-1 hidden md:inline-flex", t.color)}>
                            <I className="w-3 h-3 mr-1" />{t.label}
                          </Badge>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Record */}
                  <div className="hidden md:flex md:col-span-3 flex-col items-center justify-center">
                    <div className="font-mono-numbers text-sm font-medium">
                      <span className="text-primary">{myEntry.totalCorrect}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-foreground">{myEntry.totalPredictions}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Resolved</span>
                  </div>

                  {/* BuzzScore */}
                  <div className="col-span-4 md:col-span-3 text-right pr-2 md:pr-4 flex flex-col items-end">
                    {(() => {
                      const score = toScore(myEntry.buzzScore, myEntry.accuracy);
                      return (
                        <>
                          <div className="font-mono-numbers text-xl font-bold flex items-center gap-1.5 text-primary">
                            {score}
                            {score >= 65 && <TrendingUp className="w-4 h-4 text-green-500" />}
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">BuzzScore</span>
                        </>
                      );
                    })()}
                    {myEntry.tokensEarned && myEntry.tokensEarned > 0 && (
                      <div className="text-[10px] text-primary font-mono-numbers font-medium mt-1">
                        +{formatNumber(myEntry.tokensEarned)} FP
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )}

            {/* Top-3 Podium */}
            {leaderboard.filter(e => (e.rank ?? 0) <= 3).length > 0 && (() => {
              const top3 = leaderboard.filter(e => (e.rank ?? 0) <= 3);
              const ordered = [
                top3.find(e => e.rank === 2),
                top3.find(e => e.rank === 1),
                top3.find(e => e.rank === 3),
              ].filter(Boolean) as typeof top3;
              const podiumH: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-16' };
              const podiumC: Record<number, string> = { 1: 'bg-amber-500', 2: 'bg-slate-400', 3: 'bg-amber-700' };
              const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
              return (
                <div className="flex items-end justify-center gap-4 px-6 pt-8 pb-4 bg-gradient-to-b from-muted/30 to-transparent border-b border-border">
                  {ordered.map((entry) => {
                    const rank = entry.rank ?? 0;
                    const score = toScore(entry.buzzScore, entry.accuracy);
                    return (
                      <Link key={entry.user.id} href={`/profile/${entry.user.id}`} className="flex flex-col items-center group cursor-pointer flex-1 max-w-[160px]">
                        <span className="text-2xl mb-1">{medals[rank]}</span>
                        <Avatar className={cn("h-14 w-14 border-4 mb-2 transition-transform group-hover:scale-105", rank === 1 ? "border-amber-500 shadow-lg shadow-amber-500/30" : rank === 2 ? "border-slate-400" : "border-amber-700")}>
                          <AvatarImage src={entry.user.avatarUrl || undefined} />
                          <AvatarFallback className={cn("font-bold text-white text-lg", rank === 1 ? "bg-amber-500" : rank === 2 ? "bg-slate-400" : "bg-amber-700")}>
                            {entry.user.username.slice(0,2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors text-center truncate max-w-full px-1">
                          {entry.user.username}
                          {entry.user.id === currentUserId && <span className="ml-1 text-[10px] bg-primary text-primary-foreground px-1 py-0.5 rounded font-bold uppercase">You</span>}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-0.5">#{rank}</span>
                        <span className="font-mono-numbers font-bold text-lg mt-0.5" style={{ color: rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : '#b45309' }}>{score}</span>
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">BuzzScore</span>
                        {score != null && typeof score === 'number' && (
                          <span className={cn("text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full mt-0.5", score >= 80 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : score >= 65 ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                            {score >= 80 ? 'Elite' : score >= 65 ? 'Expert' : 'Developing'}
                          </span>
                        )}
                         {entry.totalPredictions > 0 && (
                           <span className="text-[9px] text-muted-foreground/70 font-mono-numbers">
                             {entry.totalCorrect}/{entry.totalPredictions} correct
                           </span>
                         )}
                        <div className={cn("w-full mt-2 rounded-t-lg", podiumH[rank] ?? 'h-16', podiumC[rank] ?? 'bg-muted')} style={{ opacity: 0.15 + (rank === 1 ? 0.25 : rank === 2 ? 0.15 : 0.1) }} />
                      </Link>
                    );
                  })}
                </div>
              );
            })()}

            <div className="divide-y divide-border">
              {leaderboard.filter(entry => (entry.rank ?? 0) > 3).map((entry, rowIdx) => {
                const score = toScore(entry.buzzScore, entry.accuracy);
                const tier = getTierInfo(score);
                const TierIcon = tier.icon;
                
                return (
                  <Link key={entry.user.id} href={`/profile/${entry.user.id}`}>
                    <div className={cn(
                      "grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/30 transition-colors cursor-pointer group animate-slide-up",
                      "opacity-0 [animation-fill-mode:forwards]",
                      entry.user.id === currentUserId && "bg-primary/5"
                    )} style={{ animationDelay: `${rowIdx * 30}ms` }}>
                      {/* Rank */}
                      <div className="col-span-2 md:col-span-1 text-center">
                        <span className={cn(
                          "font-editorial font-bold text-xl",
                          entry.rank === 1 ? "text-amber-500 text-3xl" : 
                          entry.rank === 2 ? "text-slate-400 text-2xl" : 
                          entry.rank === 3 ? "text-amber-700 text-2xl" : "text-muted-foreground"
                        )}>
                          {entry.rank}
                        </span>
                      </div>

                      {/* User */}
                      <div className="col-span-6 md:col-span-5 flex items-center gap-3">
                        <Avatar className={cn(
                          "h-10 w-10 md:h-12 md:w-12 border-2",
                          entry.rank === 1 ? "border-amber-500" : "border-transparent"
                        )}>
                          <AvatarImage src={entry.user.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {entry.user.username.slice(0,2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                              {entry.user.username}
                            </span>
                            {entry.user.id === currentUserId && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground leading-none">
                                YOU
                              </span>
                            )}
                          </div>
                          <Badge variant="outline" className={cn("text-[10px] mt-1 hidden md:inline-flex", tier.color)}>
                            <TierIcon className="w-3 h-3 mr-1" /> {tier.label}
                          </Badge>
                        </div>
                      </div>

                      {/* Record */}
                      <div className="md:col-span-3 flex flex-col items-center justify-center">
                        <div className="font-mono-numbers text-sm font-medium">
                          <span className="text-primary">{entry.totalCorrect}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-foreground">{entry.totalPredictions}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Resolved</span>
                      </div>

                      {/* BuzzScore */}
                      <div className="col-span-4 md:col-span-3 text-right pr-2 md:pr-4 flex flex-col items-end">
                        <div className="font-mono-numbers text-xl font-bold flex items-center gap-1.5">
                          {score}
                          {score >= 65 && <TrendingUp className="w-4 h-4 text-green-500" />}
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">BuzzScore</span>
                        {entry.accuracy != null && (
                          <span className="text-[10px] text-muted-foreground font-mono-numbers">{Math.round(entry.accuracy * 100)}% acc</span>
                        )}
                        {entry.tokensEarned != null && (
                          <div className={`text-[10px] font-mono-numbers font-medium mt-1 ${entry.tokensEarned > 0 ? 'text-primary' : entry.tokensEarned < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {entry.tokensEarned > 0 ? '+' : ''}{formatNumber(entry.tokensEarned)} FP
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium">Not enough data to generate leaderboard.</p>
          </div>
        )}

        {/* Unranked nudge for logged-in users not yet on the board */}
        {!!user && !myEntry && leaderboard && leaderboard.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-3 p-4 rounded-2xl bg-muted/40 border border-dashed border-border">
            <TrendingUp className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              You're not on the board yet — make more predictions to earn a BuzzScore and climb the ranks.
            </p>
            <Link href="/markets">
              <Button size="sm" variant="outline">Explore Markets</Button>
            </Link>
          </div>
        )}

        {/* Scoring legend */}
        <div className="mt-10 rounded-2xl border border-border/50 bg-muted/20 p-5 text-sm text-muted-foreground space-y-3">
          <p className="font-semibold text-foreground text-xs uppercase tracking-widest">How Rankings Work</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="font-bold text-foreground mb-1">🎯 BuzzScore</p>
              <p>Your accuracy score across all resolved predictions. The closer your calls are to the final outcome, the higher your BuzzScore climbs.</p>
            </div>
            <div>
              <p className="font-bold text-foreground mb-1">📊 Tiers</p>
              <ul className="space-y-0.5">
                <li><span className="font-semibold text-amber-500">Elite</span> — BuzzScore ≥ 80</li>
                <li><span className="font-semibold text-blue-500">Expert</span> — BuzzScore ≥ 65</li>
                <li><span className="font-semibold text-muted-foreground">Developing</span> — Building up</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-foreground mb-1">💰 Forecast Points</p>
              <p>Earned by staking FP on correct predictions. Points are awarded when markets resolve — wrong calls lose the stake.</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/60 pt-1 border-t border-border/30">Rankings refresh every 30 seconds · Top 100 forecasters shown · Unresolved predictions do not count toward BuzzScore</p>
          <div className="pt-3 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground/70">Every resolved call counts toward your BuzzScore. Start making calls to climb the ranks.</p>
            <Link href="/markets">
              <button className="px-5 py-2 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap">
                Explore Markets →
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
