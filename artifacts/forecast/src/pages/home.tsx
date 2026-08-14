import { useGetTrendingMarkets, useGetPlatformStats, useGetMarketCategories, useListMarkets, useGetMe, useGetUserPins, getListMarketsQueryKey } from "@workspace/api-client-react";
import { MarketCard } from "@/components/market-card";
import { BuzzOrBooCard } from "@/components/buzz-or-boo-card";
import { TheCallCard } from "@/components/the-call-card";
import { MultiChoiceCard } from "@/components/multi-choice-card";
import { HeadToHeadCard } from "@/components/head-to-head-card";
import { HotOrNotCard } from "@/components/hot-or-not-card";
// Note: BuzzOrBooCard, TheCallCard, MultiChoiceCard are kept for format-specific sections below
import { BostonSays } from "@/components/boston-says";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, TrendingUp, Activity, Users, Zap, Bookmark, CheckCircle2 } from "lucide-react";
import { formatNumber, formatCompactNumber } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { useAuth } from "@workspace/replit-auth-web";

export default function Home() {
  const { user } = useAuth();
  const { data: trendingMarkets, isLoading: loadingMarkets, isError: trendingError, refetch: refetchTrending } = useGetTrendingMarkets({ limit: 7 }, { query: { refetchInterval: 30000 } });
  const { data: stats, isLoading: loadingStats } = useGetPlatformStats();
  const { data: categories } = useGetMarketCategories();
  const hotOrNotParams = { format: "HOT_OR_NOT" as const, status: "OPEN" as const, limit: 6 };
  const { data: hotOrNotData, isLoading: loadingHotOrNot, isError: hotOrNotError, refetch: refetchHotOrNot } = useListMarkets(hotOrNotParams, { query: { queryKey: getListMarketsQueryKey(hotOrNotParams), refetchInterval: 30000 } });
  const buzzOrBooParams = { format: "BUZZ_OR_BOO" as const, status: "OPEN" as const, limit: 5 };
  const { data: buzzOrBooData, isLoading: loadingBuzzOrBoo, isError: buzzOrBooError, refetch: refetchBuzzOrBoo } = useListMarkets(buzzOrBooParams, { query: { queryKey: getListMarketsQueryKey(buzzOrBooParams), refetchInterval: 15000 } });
  const theCallParams = { format: "THE_CALL" as const, status: "OPEN" as const, limit: 6 };
  const { data: theCallData, isLoading: loadingTheCall, isError: theCallError, refetch: refetchTheCall } = useListMarkets(theCallParams, { query: { queryKey: getListMarketsQueryKey(theCallParams), refetchInterval: 15000 } });
  const buzzBattleParams = { format: "MULTI_CHOICE" as const, status: "OPEN" as const, limit: 6 };
  const { data: buzzBattleData, isLoading: loadingBuzzBattle, isError: buzzBattleError, refetch: refetchBuzzBattle } = useListMarkets(buzzBattleParams, { query: { queryKey: getListMarketsQueryKey(buzzBattleParams), refetchInterval: 30000 } });
  const headToHeadParams = { format: "HEAD_TO_HEAD" as const, status: "OPEN" as const, limit: 6 };
  const { data: headToHeadData, isLoading: loadingHeadToHead, isError: headToHeadError, refetch: refetchHeadToHead } = useListMarkets(headToHeadParams, { query: { queryKey: getListMarketsQueryKey(headToHeadParams), refetchInterval: 30000 } });
  const { data: meData } = useGetMe({ query: { enabled: !!user } });
  const { data: pinsRaw, isLoading: loadingPins, isError: pinsError, refetch: refetchPins } = useGetUserPins(Number(user?.id), { query: { enabled: !!user?.id } });
  const pinsData = (pinsRaw as any)?.pins as any[] | undefined;
  const upcomingParams = { status: "SCHEDULED" as const, limit: 4 };
  const { data: upcomingData, isLoading: loadingUpcoming, isError: upcomingError, refetch: refetchUpcoming } = useListMarkets(upcomingParams, { query: { queryKey: getListMarketsQueryKey(upcomingParams), refetchInterval: 60000 } });
  const resolvedParams = { status: "RESOLVED" as const, limit: 5 };
  const { data: resolvedData, isLoading: loadingResolved, isError: resolvedError, refetch: refetchResolved } = useListMarkets(resolvedParams, { query: { queryKey: getListMarketsQueryKey(resolvedParams), refetchInterval: 60000 } });
  const standardParams = { format: "STANDARD" as const, status: "OPEN" as const, limit: 6 };
  const { data: standardData, isLoading: loadingStandard, isError: standardError, refetch: refetchStandard } = useListMarkets(standardParams, { query: { queryKey: getListMarketsQueryKey(standardParams), refetchInterval: 30000 } });

  return (
    <div className="pb-24">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50 bg-muted/20">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] opacity-[0.07] bg-cover bg-center mix-blend-luminosity pointer-events-none" />
        
        <div className="container mx-auto px-4 pt-20 pb-24 md:pt-32 md:pb-32 relative z-10">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
              <Zap className="w-4 h-4" style={{ color: "hsl(43 72% 48%)" }} />
              Boston's Cultural Prediction Engine
            </div>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-editorial font-bold leading-[1.05] tracking-tight text-balance mb-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
              {user ? `Welcome back${meData && 'username' in (meData as any) ? `, ${(meData as any).username}` : ''}.` : "Call what's next."}
            </h1>
            <p className="text-base md:text-lg font-bold tracking-widest uppercase text-muted-foreground mb-4 animate-slide-up" style={{ animationDelay: "150ms", letterSpacing: "0.14em" }}>
              What's hot. What's better. What's next.
            </p>
            <p className="text-xl md:text-2xl text-muted-foreground font-medium text-balance max-w-2xl mb-10 animate-slide-up" style={{ animationDelay: "200ms" }}>
              {user
                ? "Your calls are on the record. Keep building your BuzzScore — every correct prediction counts."
                : "Boston's cultural prediction platform. Make a call before everyone else and build a public record of how good you are at seeing what's coming."}
            </p>
            <div className="flex flex-wrap items-center gap-4 animate-slide-up" style={{ animationDelay: "300ms" }}>
              <Link href="/markets">
                <Button size="lg" className="h-14 px-8 text-lg rounded-full">
                  Explore Markets <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              {!user ? (
                <Link href="/auth">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-full border-foreground/20 hover:border-primary/50">
                    Join & make your call
                  </Button>
                </Link>
              ) : (
                <Link href={`/profile/${user.id}`}>
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-full border-foreground/20 hover:border-primary/50">
                    My Calls <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
              )}
            </div>
            {stats && (stats.totalUsers ?? 0) > 0 && (
              <p className="text-sm text-muted-foreground mt-6">
                <span className="font-mono-numbers font-semibold text-foreground">{(stats.totalUsers ?? 0).toLocaleString()}</span> {(stats.totalUsers ?? 0) === 1 ? "forecaster has" : "forecasters have"} already made their call.
              </p>
            )}
          </div>
        </div>

        {/* Stats Strip */}
        <div className="border-t border-border/50 bg-background/50 backdrop-blur-md">
          <div className="container mx-auto px-4 py-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-4">Forecast activity</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 divide-x divide-border/0 md:divide-border/50">
              <Link href="/markets?status=OPEN" className="group flex flex-col gap-1 hover:opacity-90 transition-all duration-200 hover:scale-[1.03] rounded-xl p-2 -m-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground/80 transition-colors">
                  <Activity className="w-4 h-4" /> Open Markets
                </span>
                {loadingStats ? (
                  <div className="h-9 w-16 bg-muted/60 rounded-lg animate-pulse mt-0.5" />
                ) : (
                  <span className="text-3xl font-editorial font-bold text-foreground">
                    {stats?.openMarkets != null ? formatNumber(stats.openMarkets) : "—"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground/60 group-hover:text-primary/70 transition-colors">explore markets →</span>
              </Link>
              <Link href="/markets" className="group flex flex-col gap-1 md:px-6 hover:opacity-90 transition-all duration-200 hover:scale-[1.03] rounded-xl p-2 -m-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground/80 transition-colors">
                  <TrendingUp className="w-4 h-4" /> Total Predictions
                </span>
                {loadingStats ? (
                  <div className="h-9 w-20 bg-muted/60 rounded-lg animate-pulse mt-0.5" />
                ) : (
                  <span className="text-3xl font-editorial font-bold text-foreground">
                    {stats?.totalPredictions != null ? formatCompactNumber(stats.totalPredictions) : "—"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground/60 group-hover:text-primary/70 transition-colors">calls placed →</span>
              </Link>
              <Link href="/leaderboard" className="group flex flex-col gap-1 md:px-6 hover:opacity-90 transition-all duration-200 hover:scale-[1.03] rounded-xl p-2 -m-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground/80 transition-colors">
                  <Users className="w-4 h-4" /> Forecasters
                </span>
                {loadingStats ? (
                  <div className="h-9 w-16 bg-muted/60 rounded-lg animate-pulse mt-0.5" />
                ) : (
                  <span className="text-3xl font-editorial font-bold text-foreground">
                    {stats?.totalUsers != null ? formatNumber(stats.totalUsers) : "—"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground/60 group-hover:text-primary/70 transition-colors">view leaderboard →</span>
              </Link>
              <Link href="/leaderboard" className="group flex flex-col gap-1 md:px-6 hover:opacity-90 transition-all duration-200 hover:scale-[1.03] rounded-xl p-2 -m-2">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground/80 transition-colors">
                  <Zap className="w-4 h-4" /> Avg Accuracy
                </span>
                {loadingStats ? (
                  <div className="h-9 w-20 bg-muted/60 rounded-lg animate-pulse mt-0.5" />
                ) : (
                  <span className="text-3xl font-editorial font-bold text-primary">
                    {stats?.avgAccuracy != null ? `${stats.avgAccuracy.toFixed(1)}%` : "—"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground/60 group-hover:text-primary/70 transition-colors">platform avg →</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Category Quick Nav */}
      <section className="py-12 border-b border-border/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Browse by Category</h2>
              <span className="text-[10px] text-muted-foreground/40 hidden sm:inline">← scroll →</span>
            </div>
            <Link href="/markets" className="text-xs text-primary hover:underline font-semibold">View all markets →</Link>
          </div>
          <div className="flex overflow-x-auto hide-scrollbar gap-4 pb-4 -mb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {!categories ? (
              // Loading skeleton
              [1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex-none flex items-center gap-3 px-6 py-4 rounded-2xl bg-muted/40 min-w-[200px] animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-muted" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                </div>
              ))
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No categories available right now.</p>
            ) : (
              categories.map((cat) => (
                <Link key={cat.category} href={`/markets?category=${cat.category}`}>
                  <div className={`flex-none flex items-center gap-3 px-6 py-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer whitespace-nowrap min-w-[200px] group${cat.openMarkets === 0 ? ' opacity-40' : ''}`}>
                    <CategoryIcon category={cat.category} className="w-8 h-8 group-hover:scale-110 transition-transform" />
                    <div className="flex flex-col">
                      <span className="font-bold">{getCategoryLabel(cat.category)}</span>
                      <span className="text-xs text-muted-foreground font-mono-numbers">
                        {cat.openMarkets > 0 ? `${cat.openMarkets} open` : 'None open'}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Trending Markets */}
      {(loadingMarkets || trendingError || trendingMarkets != null) && <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-3" style={{ backgroundColor: "rgba(34,197,94,0.10)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.25)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Right Now
              </div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl md:text-4xl font-editorial font-bold">Trending Now</h2>
                {trendingMarkets?.total != null && trendingMarkets.total > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono-numbers font-semibold self-end mb-1" style={{ backgroundColor: "rgba(34,197,94,0.10)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.25)" }}>
                    {trendingMarkets.total} open
                  </span>
                )}
              </div>
              <p className="text-muted-foreground font-medium">See what Boston forecasters are calling right now.</p>
            </div>
            <Link href="/markets">
              <Button variant="ghost" className="hidden md:flex">
                See All Markets <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          {loadingMarkets ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3, 4, 5, 6, 7].map(i => (
                <div key={i} className="h-80 bg-muted rounded-xl" />
              ))}
            </div>
          ) : trendingError ? (
            <div className="py-16 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
              <span className="text-3xl">📡</span>
              <p className="text-sm text-muted-foreground font-medium">Couldn't load trending markets.</p>
              <button onClick={() => refetchTrending()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
            </div>
          ) : trendingMarkets?.markets && trendingMarkets.markets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[320px]">
              {trendingMarkets.markets.map((market, i) => {
                const fmt = (market as any).marketFormat;
                if (fmt === 'BUZZ_OR_BOO') return <BuzzOrBooCard key={market.id} market={market as any} featured={i === 0} />;
                if (fmt === 'THE_CALL') return <TheCallCard key={market.id} market={market as any} featured={i === 0} />;
                if (fmt === 'MULTI_CHOICE') return <MultiChoiceCard key={market.id} market={market as any} featured={i === 0} />;
                if (fmt === 'HOT_OR_NOT') return <HotOrNotCard key={market.id} market={market as any} featured={i === 0} />;
                if (fmt === 'HEAD_TO_HEAD') return <HeadToHeadCard key={market.id} market={market as any} featured={i === 0} />;
                return <MarketCard key={market.id} market={market} featured={i === 0} />;
              })}
            </div>
          ) : (
            <div className="text-center py-20 bg-muted/30 rounded-2xl border border-dashed border-border flex flex-col items-center gap-4">
              <p className="text-muted-foreground font-medium">No trending markets right now.</p>
              <Link href="/markets">
                <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                  Browse all markets <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          )}
          
          <div className="mt-10 text-center md:hidden">
            <Link href="/markets">
              <Button variant="outline" className="w-full">
                See All Trending Markets <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>}

      {/* Hot or Not */}
      {(loadingHotOrNot || hotOrNotError || hotOrNotData != null) && (
        <section className="py-16 md:py-24 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-bold uppercase tracking-widest">
                    🔥 Hot or Not
                  </div>
                  {hotOrNotData?.total != null && hotOrNotData.total > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-mono-numbers font-bold border border-orange-500/20">{hotOrNotData.total} open</span>
                  )}
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Is Boston Feeling It?</h2>
                <p className="text-muted-foreground font-medium">Vote on whether these spots, trends &amp; names are heating up — or fading out.</p>
              </div>
              <Link href="/markets?format=HOT_OR_NOT">
                <Button variant="ghost" className="hidden md:flex">
                  See All Hot or Not <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingHotOrNot ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-72 bg-muted rounded-xl" />)}
              </div>
            ) : hotOrNotError ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load Hot or Not markets.</p>
                <button onClick={() => refetchHotOrNot()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : hotOrNotData?.markets?.length === 0 ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50 flex flex-col items-center gap-3">
                <span className="text-3xl">🔥</span>
                <p className="text-sm font-medium">No Hot or Not markets open right now</p>
                <p className="text-xs text-muted-foreground">Check back soon — new verdicts drop regularly.</p>
                <Link href="/markets?format=HOT_OR_NOT"><button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Browse All Hot or Not</button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[300px]">
                {hotOrNotData?.markets?.slice(0, 6).map((market, i) => (
                  <HotOrNotCard key={market.id} market={market} featured={i === 0} />
                ))}
              </div>
            )}
            <div className="mt-6 md:hidden">
              <Link href="/markets?format=HOT_OR_NOT">
                <Button variant="outline" className="w-full">
                  See All Hot or Not Markets <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Buzz or Boo */}
      {(loadingBuzzOrBoo || buzzOrBooError || buzzOrBooData != null) && (
        <section className="py-16 md:py-24 border-b border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ backgroundColor: "#CFEA3B22", color: "#CFEA3B", border: "1px solid #CFEA3B44" }}>
                    ⚡ Buzz or Boo
                  </div>
                  {buzzOrBooData?.total != null && buzzOrBooData.total > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono-numbers font-bold border" style={{ backgroundColor: "#CFEA3B15", color: "#8B9A00", borderColor: "#CFEA3B33" }}>{buzzOrBooData.total} open</span>
                  )}
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Quick Verdicts</h2>
                <p className="text-muted-foreground font-medium">Is it buzzing or getting booed? Drop your verdict in seconds.</p>
              </div>
              <Link href="/markets?format=BUZZ_OR_BOO">
                <Button variant="ghost" className="hidden md:flex">
                  See All Buzz or Boo <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingBuzzOrBoo ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-64 bg-muted rounded-xl" />)}
              </div>
            ) : buzzOrBooError ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load Buzz or Boo markets.</p>
                <button onClick={() => refetchBuzzOrBoo()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : buzzOrBooData?.markets?.length === 0 ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50 flex flex-col items-center gap-3">
                <span className="text-3xl">⚡</span>
                <p className="text-sm font-medium">No Buzz or Boo markets open right now</p>
                <p className="text-xs text-muted-foreground">New verdicts drop regularly — check back soon.</p>
                <Link href="/markets?format=BUZZ_OR_BOO"><button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Browse All Buzz or Boo</button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[280px]">
                {buzzOrBooData?.markets?.slice(0, 5).map((market, i) => (
                  <BuzzOrBooCard key={market.id} market={market} featured={i === 0} />
                ))}
              </div>
            )}

            <div className="mt-8 text-center md:hidden">
              <Link href="/markets?format=BUZZ_OR_BOO">
                <Button variant="outline" className="w-full">
                  See All Buzz or Boo <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* The Call */}
      {(loadingTheCall || theCallError || theCallData != null) && (
        <section className="py-16 md:py-24 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ backgroundColor: "#8B5CF622", color: "#8B5CF6", border: "1px solid #8B5CF644" }}>
                    🎯 The Call
                  </div>
                  {theCallData?.total != null && theCallData.total > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono-numbers font-bold border" style={{ backgroundColor: "#8B5CF615", color: "#8B5CF6", borderColor: "#8B5CF633" }}>{theCallData.total} open</span>
                  )}
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Make The Call</h2>
                <p className="text-muted-foreground font-medium">Pick the right answer before the crowd locks it in. Your track record is on the line.</p>
              </div>
              <Link href="/markets?format=THE_CALL">
                <Button variant="ghost" className="hidden md:flex">
                  See All The Call <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingTheCall ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-72 bg-muted rounded-xl" />)}
              </div>
            ) : theCallError ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load The Call markets.</p>
                <button onClick={() => refetchTheCall()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : theCallData?.markets?.length === 0 ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50 flex flex-col items-center gap-3">
                <span className="text-3xl">🎯</span>
                <p className="text-sm font-medium">No The Call markets open right now</p>
                <p className="text-xs text-muted-foreground">New picks go live regularly — check back soon.</p>
                <Link href="/markets?format=THE_CALL"><button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Browse All The Call</button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[320px]">
                {theCallData?.markets?.slice(0, 6).map((market, i) => (
                  <TheCallCard key={market.id} market={market} featured={i === 0} />
                ))}
              </div>
            )}

            <div className="mt-8 text-center md:hidden">
              <Link href="/markets?format=THE_CALL">
                <Button variant="outline" className="w-full">
                  See All The Call Markets <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Buzz Battle */}
      {(loadingBuzzBattle || buzzBattleError || buzzBattleData != null) && (
        <section className="py-16 md:py-24 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ backgroundColor: "#CFEA3B22", color: "#8B9A00", border: "1px solid #CFEA3B44" }}>
                    👑 Buzz Battle
                  </div>
                  {buzzBattleData?.total != null && buzzBattleData.total > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono-numbers font-bold border" style={{ backgroundColor: "#CFEA3B15", color: "#8B9A00", borderColor: "#CFEA3B33" }}>{buzzBattleData.total} open</span>
                  )}
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Pick Your Champion</h2>
                <p className="text-muted-foreground font-medium">Multiple contenders. One winner. Back yours before the crowd decides.</p>
              </div>
              <Link href="/markets?format=MULTI_CHOICE">
                <Button variant="ghost" className="hidden md:flex">
                  See All Buzz Battle <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingBuzzBattle ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-80 bg-muted rounded-xl" />)}
              </div>
            ) : buzzBattleError ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load Buzz Battle markets.</p>
                <button onClick={() => refetchBuzzBattle()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : buzzBattleData?.markets?.length === 0 ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50 flex flex-col items-center gap-3">
                <span className="text-3xl">👑</span>
                <p className="text-sm font-medium">No Buzz Battle markets open right now</p>
                <p className="text-xs text-muted-foreground">Multi-contender races launch regularly — check back soon.</p>
                <Link href="/markets?format=MULTI_CHOICE"><button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Browse All Buzz Battle</button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[360px]">
                {buzzBattleData?.markets?.slice(0, 6).map((market, i) => (
                  <MultiChoiceCard key={market.id} market={market as any} featured={i === 0} />
                ))}
              </div>
            )}

            <div className="mt-8 text-center md:hidden">
              <Link href="/markets?format=MULTI_CHOICE">
                <Button variant="outline" className="w-full">
                  See All Buzz Battle Markets <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Head to Head */}
      {(loadingHeadToHead || headToHeadError || headToHeadData != null) && (
        <section className="py-16 md:py-24 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ backgroundColor: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f644" }}>
                    ⚔️ Head to Head
                  </div>
                  {headToHeadData?.total != null && headToHeadData.total > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-mono-numbers font-bold border border-blue-500/20">{headToHeadData.total} open</span>
                  )}
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Two Sides. Pick One.</h2>
                <p className="text-muted-foreground font-medium">Which side takes it? Cast your call and see where the crowd stands.</p>
              </div>
              <Link href="/markets?format=HEAD_TO_HEAD">
                <Button variant="ghost" className="hidden md:flex">
                  See All Head to Head <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingHeadToHead ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
                {[1, 2].map(i => <div key={i} className="h-80 bg-muted rounded-xl" />)}
              </div>
            ) : headToHeadError ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load Head to Head markets.</p>
                <button onClick={() => refetchHeadToHead()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : headToHeadData?.markets?.length === 0 ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50 flex flex-col items-center gap-3">
                <span className="text-3xl">⚔️</span>
                <p className="text-sm font-medium">No Head to Head markets open right now</p>
                <p className="text-xs text-muted-foreground">New matchups launch regularly — check back soon.</p>
                <Link href="/markets?format=HEAD_TO_HEAD"><button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Browse All Head to Head</button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[340px]">
                {headToHeadData?.markets?.slice(0, 6).map((market, i) => (
                  <HeadToHeadCard key={market.id} market={market as any} featured={i === 0} />
                ))}
              </div>
            )}

            <div className="mt-8 text-center md:hidden">
              <Link href="/markets?format=HEAD_TO_HEAD">
                <Button variant="outline" className="w-full">
                  See All Head to Head Markets <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Standard Forecast — YES/NO markets */}
      {(loadingStandard || standardError || standardData != null) && (
        <section className="py-16 md:py-24 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                    📊 Forecast
                  </div>
                  {standardData?.total != null && standardData.total > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-mono-numbers font-bold border border-primary/20">{standardData.total} open</span>
                  )}
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Yes or No. Simple as That.</h2>
                <p className="text-muted-foreground font-medium">Classic predictions — pick YES or NO and put your intuition on record.</p>
              </div>
              <Link href="/markets?format=STANDARD">
                <Button variant="ghost" className="hidden md:flex">
                  See All Forecast <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingStandard ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-52 bg-muted rounded-xl" />)}
              </div>
            ) : standardError ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load Forecast markets.</p>
                <button onClick={() => refetchStandard()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : (standardData?.markets?.length ?? 0) === 0 ? (
              <div className="py-12 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50 flex flex-col items-center gap-3">
                <span className="text-3xl">📊</span>
                <p className="font-editorial font-bold text-lg">No Forecast markets open right now</p>
                <p className="text-sm text-muted-foreground max-w-xs">Classic YES/NO predictions launch regularly — check back soon.</p>
                <Link href="/markets?format=STANDARD"><Button variant="outline" size="sm">Browse All Forecast Markets</Button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {standardData?.markets?.slice(0, 6).map((market) => (
                  <MarketCard key={market.id} market={market as any} />
                ))}
              </div>
            )}

            <div className="mt-8 text-center md:hidden">
              <Link href="/markets?format=STANDARD">
                <Button variant="outline" className="w-full">
                  See All Forecast Markets <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Personalized: Your Pinned Markets — logged-in users only */}
      {user && loadingPins && (
        <section className="py-8 border-t border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-3 mb-5">
              <Bookmark className="w-5 h-5 text-muted-foreground" />
              <div className="h-6 w-40 bg-muted/60 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-44 bg-muted/40 rounded-2xl animate-pulse border border-border/30" />
              ))}
            </div>
          </div>
        </section>
      )}
      {user && !loadingPins && pinsError && (
        <section className="py-8 border-t border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-3 mb-3">
              <Bookmark className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-xl font-editorial font-bold">Your Pinned Markets</h2>
            </div>
            <div className="py-8 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
              <span className="text-2xl">📡</span>
              <p className="text-sm text-muted-foreground">Couldn't load your saved markets.</p>
              <button onClick={() => refetchPins()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
            </div>
          </div>
        </section>
      )}
      {user && pinsData && pinsData.length === 0 && (
        <section className="py-10 border-t border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-2 mb-3">
              <Bookmark className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-primary">Saved</span>
            </div>
            <h2 className="text-xl font-editorial font-bold mb-2">Your Pinned Markets</h2>
            <p className="text-muted-foreground text-sm mb-3">Nothing pinned yet — hit the bookmark icon on any market to track it here.</p>
            <Link href="/markets">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                Browse markets <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </section>
      )}
      {user && pinsData && pinsData.length > 0 && (
        <section className="py-12 border-t border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Bookmark className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">Saved</span>
                </div>
                <h2 className="text-2xl font-editorial font-bold">Your Pinned Markets</h2>
              </div>
              <Link href={`/profile/${user.id}`}>
                <Button variant="ghost" size="sm">
                  View all{pinsData.length > 3 ? ` (${pinsData.length})` : ""}
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pinsData.slice(0, 3).map((m: any) => {
                const fmt = m.marketFormat;
                if (fmt === 'BUZZ_OR_BOO') return <BuzzOrBooCard key={m.id} market={m} />;
                if (fmt === 'THE_CALL') return <TheCallCard key={m.id} market={m} />;
                if (fmt === 'MULTI_CHOICE') return <MultiChoiceCard key={m.id} market={m} />;
                if (fmt === 'HEAD_TO_HEAD') return <HeadToHeadCard key={m.id} market={m} />;
                if (fmt === 'HOT_OR_NOT') return <HotOrNotCard key={m.id} market={m} />;
                return <MarketCard key={m.id} market={m} />;
              })}
            </div>
            {meData && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono-numbers font-bold text-foreground">{meData.tokenBalance.toLocaleString()}</span>
                <span>Forecast Points available</span>
                <span className="text-border">·</span>
                <span className="font-mono-numbers font-bold text-foreground">{meData.totalPredictions}</span>
                <span>predictions made</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Upcoming Markets */}
      {(loadingUpcoming || upcomingError || upcomingData != null) && (
        <section className="py-16 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-10">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">Opening Soon</span>
                <h2 className="text-2xl font-editorial font-bold">Upcoming Markets
                  {upcomingData?.total != null && upcomingData.total > 0 && (
                    <span className="ml-2 text-base font-mono-numbers text-muted-foreground font-normal">({upcomingData.total})</span>
                  )}
                </h2>
                <p className="text-muted-foreground text-sm mt-1">Browse what's opening soon and get ready to call it.</p>
              </div>
              <Link href="/markets?status=SCHEDULED">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
            {loadingUpcoming ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-40 bg-muted/40 rounded-2xl animate-pulse border border-border/30" />
                ))}
              </div>
            ) : upcomingError ? (
              <div className="py-10 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load upcoming markets.</p>
                <button onClick={() => refetchUpcoming()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : (upcomingData?.markets?.length ?? 0) === 0 ? (
              <div className="py-10 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50 flex flex-col items-center gap-3">
                <span className="text-3xl">🗓</span>
                <p className="font-editorial font-bold text-lg">No markets scheduled right now</p>
                <p className="text-sm text-muted-foreground max-w-xs">New markets launch regularly — check back soon.</p>
                <Link href="/markets?status=OPEN"><Button variant="outline" size="sm">Browse Open Markets Instead</Button></Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(upcomingData?.markets ?? []).slice(0, 8).map(market =>
                    market.marketFormat === 'BUZZ_OR_BOO' ? (
                      <BuzzOrBooCard key={market.id} market={market} />
                    ) : market.marketFormat === 'THE_CALL' ? (
                      <TheCallCard key={market.id} market={market} />
                    ) : market.marketFormat === 'MULTI_CHOICE' ? (
                      <MultiChoiceCard key={market.id} market={market as any} />
                    ) : market.marketFormat === 'HOT_OR_NOT' ? (
                      <HotOrNotCard key={market.id} market={market} />
                    ) : market.marketFormat === 'HEAD_TO_HEAD' ? (
                      <HeadToHeadCard key={market.id} market={market as any} />
                    ) : (
                      <MarketCard key={market.id} market={market} />
                    )
                  )}
                </div>
                {(upcomingData?.markets?.length ?? 0) > 8 && (
                  <div className="mt-6 text-center">
                    <Link href="/markets?status=SCHEDULED">
                      <Button variant="outline" size="sm">
                        See all {upcomingData!.markets.length} upcoming markets <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                )}
              </>
            )}
            <div className="mt-8 text-center md:hidden">
              <Link href="/markets?status=SCHEDULED">
                <Button variant="outline" className="w-full">
                  See All Upcoming <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Recently Resolved */}
      {(loadingResolved || resolvedError || resolvedData) && (
        <section className="py-12 border-t border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 block mb-1">Final Verdicts</span>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <h2 className="text-2xl font-editorial font-bold">Recently Resolved</h2>
                  {resolvedData?.total != null && resolvedData.total > 0 && (
                    <span className="text-xs font-mono-numbers text-muted-foreground">{resolvedData.total}</span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mt-1">The crowd has spoken — see how the calls landed.</p>
              </div>
              <Link href="/markets?status=RESOLVED">
                <Button variant="ghost" size="sm">See All <ArrowRight className="w-4 h-4 ml-1" /></Button>
              </Link>
            </div>
            {loadingResolved ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-64 bg-muted rounded-xl" />)}
              </div>
            ) : resolvedError ? (
              <div className="py-10 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
                <span className="text-2xl">📡</span>
                <p className="text-sm text-muted-foreground">Couldn't load resolved markets.</p>
                <button onClick={() => refetchResolved()} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
              </div>
            ) : !resolvedData?.markets?.length ? (
              <div className="py-10 text-center bg-muted/20 rounded-2xl border border-dashed border-border/40 flex flex-col items-center gap-3">
                <span className="text-2xl">🔍</span>
                <p className="text-sm text-muted-foreground">No resolved markets yet — check back soon.</p>
                <Link href="/markets?status=OPEN">
                  <Button variant="ghost" size="sm">Browse open markets <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
                </Link>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(resolvedData?.markets ?? []).slice(0, 5).map(market => {
                const fmt = (market as any).marketFormat;
                if (fmt === 'BUZZ_OR_BOO') return <BuzzOrBooCard key={market.id} market={market as any} />;
                if (fmt === 'THE_CALL') return <TheCallCard key={market.id} market={market as any} />;
                if (fmt === 'MULTI_CHOICE') return <MultiChoiceCard key={market.id} market={market as any} />;
                if (fmt === 'HEAD_TO_HEAD') return <HeadToHeadCard key={market.id} market={market as any} />;
                if (fmt === 'HOT_OR_NOT') return <HotOrNotCard key={market.id} market={market as any} />;
                return <MarketCard key={market.id} market={market} />;
              })}
            </div>
            )}
            <div className="mt-8 text-center md:hidden">
              <Link href="/markets?status=RESOLVED">
                <Button variant="outline" className="w-full">
                  See All <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Boston Says — Opinion Polls */}
      <BostonSays />

      {/* Footer CTA */}
      <section className="py-16 px-4 text-center bg-gradient-to-b from-background to-muted/40">
        <div className="max-w-lg mx-auto">
          {user ? (
            <>
              <div className="text-4xl mb-4">⚡</div>
              <h2 className="font-editorial text-3xl font-bold mb-3">Your next call is waiting.</h2>
              <p className="text-muted-foreground mb-6">
                Every correct call raises your BuzzScore. Keep making picks to climb BuzzRank.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/markets?status=OPEN">
                  <Button size="lg" className="rounded-full px-8 font-bold gap-2 w-full sm:w-auto">
                    Make a Call <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link href={user ? `/profile/${user.id}` : "/auth"}>
                  <Button size="lg" variant="outline" className="rounded-full px-8 font-bold gap-2 w-full sm:w-auto">
                    My Calls
                  </Button>
                </Link>
                <Link href="/leaderboard">
                  <Button size="lg" variant="outline" className="rounded-full px-8 font-bold gap-2 w-full sm:w-auto border-border/50 text-muted-foreground hover:text-foreground">
                    View Leaderboard
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-4xl mb-4">🎯</div>
              <h2 className="font-editorial text-3xl font-bold mb-3">Ready to make your call?</h2>
              <p className="text-muted-foreground mb-6">
                Join thousands of Boston forecasters and put your cultural intuition to the test.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/auth">
                  <Button size="lg" className="rounded-full px-8 font-bold gap-2 w-full sm:w-auto">
                    Join AHEAD — It's Free <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/markets">
                  <Button size="lg" variant="outline" className="rounded-full px-8 font-bold gap-2 w-full sm:w-auto">
                    Explore Markets
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
