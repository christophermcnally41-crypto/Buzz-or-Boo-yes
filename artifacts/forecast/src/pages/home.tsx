import { useState, useCallback } from "react";
import { useGetTrendingMarkets, useGetPlatformStats, useListMarkets, useGetMe, useGetUserPins, getListMarketsQueryKey } from "@workspace/api-client-react";
import { MarketCard } from "@/components/market-card";
import { BuzzOrBooCard } from "@/components/buzz-or-boo-card";
import { TheCallCard } from "@/components/the-call-card";
import { MultiChoiceCard } from "@/components/multi-choice-card";
import { HeadToHeadCard } from "@/components/head-to-head-card";
import { HotOrNotCard } from "@/components/hot-or-not-card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Bookmark, Zap, Circle } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { useAuth } from "@workspace/replit-auth-web";

// Dispatch any market to its correct card component
function FormatCard({ market, featured }: { market: any; featured?: boolean }) {
  const fmt = market.marketFormat;
  if (fmt === "BUZZ_OR_BOO") return <BuzzOrBooCard market={market} featured={featured} />;
  if (fmt === "THE_CALL") return <TheCallCard market={market} featured={featured} />;
  if (fmt === "MULTI_CHOICE") return <MultiChoiceCard market={market} featured={featured} />;
  if (fmt === "HOT_OR_NOT") return <HotOrNotCard market={market} featured={featured} />;
  if (fmt === "HEAD_TO_HEAD") return <HeadToHeadCard market={market} featured={featured} />;
  return <MarketCard market={market} featured={featured ?? false} />;
}

// Section header used throughout the page
function SectionHeader({
  label,
  emoji,
  title,
  subtitle,
  href,
  linkLabel = "More →",
  count,
}: {
  label: string;
  emoji?: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  count?: number;
}) {
  return (
    <div className="flex items-end justify-between mb-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {emoji && <span className="mr-1">{emoji}</span>}{label}
          </span>
          {count != null && count > 0 && (
            <span className="text-[10px] font-mono-numbers font-semibold text-muted-foreground/50">({count})</span>
          )}
        </div>
        <h2 className="text-2xl md:text-3xl font-editorial font-bold">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href}>
          <Button variant="ghost" size="sm" className="hidden md:flex gap-1 text-muted-foreground hover:text-foreground shrink-0">
            {linkLabel} <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-10 text-center bg-muted/30 rounded-2xl border border-dashed border-destructive/30 flex flex-col items-center gap-3">
      <span className="text-2xl">📡</span>
      <p className="text-sm text-muted-foreground">Couldn't load right now.</p>
      <button onClick={onRetry} className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90">Try again</button>
    </div>
  );
}

function EmptyState({ emoji, message, href, linkLabel }: { emoji: string; message: string; href: string; linkLabel: string }) {
  return (
    <div className="py-10 text-center bg-muted/20 rounded-2xl border border-dashed border-border/40 flex flex-col items-center gap-3">
      <span className="text-3xl">{emoji}</span>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href={href}>
        <Button variant="outline" size="sm" className="rounded-full text-xs">{linkLabel}</Button>
      </Link>
    </div>
  );
}

function LoadingSkeleton({ count = 3, height = "h-72" }: { count?: number; height?: string }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${height} bg-muted rounded-2xl`} />
      ))}
    </div>
  );
}

// localStorage-backed daily progress tracker
function useDailyProgress(marketIds: number[]) {
  const dateKey = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const storageKey = `buzzorboo_daily5_${dateKey}`;

  const [visited, setVisited] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  const markVisited = useCallback((id: number) => {
    setVisited(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [storageKey]);

  const count = marketIds.filter(id => visited.has(id)).length;
  return { visited, markVisited, count, total: marketIds.length };
}

export default function Home() {
  const { user } = useAuth();

  // Data fetching
  const { data: trendingData, isLoading: loadingTrending, isError: trendingError, refetch: refetchTrending } =
    useGetTrendingMarkets({ limit: 10 }, { query: { refetchInterval: 30000 } });

  const { data: stats } = useGetPlatformStats();

  const bostonParams = { category: "LOCAL_PULSE" as const, status: "OPEN" as const, limit: 6 };
  const { data: bostonData, isLoading: loadingBoston, isError: bostonError, refetch: refetchBoston } =
    useListMarkets(bostonParams, { query: { queryKey: getListMarketsQueryKey(bostonParams), refetchInterval: 30000 } });

  const battlesParams = { format: "HEAD_TO_HEAD" as const, status: "OPEN" as const, limit: 4 };
  const { data: battlesData, isLoading: loadingBattles, isError: battlesError, refetch: refetchBattles } =
    useListMarkets(battlesParams, { query: { queryKey: getListMarketsQueryKey(battlesParams), refetchInterval: 30000 } });

  const forecastParams = { format: "STANDARD" as const, status: "OPEN" as const, limit: 6 };
  const { data: forecastData, isLoading: loadingForecast, isError: forecastError, refetch: refetchForecast } =
    useListMarkets(forecastParams, { query: { queryKey: getListMarketsQueryKey(forecastParams), refetchInterval: 30000 } });

  const cultureParams = { category: "CULTURE" as const, status: "OPEN" as const, limit: 4 };
  const { data: cultureData, isLoading: loadingCulture, isError: cultureError, refetch: refetchCulture } =
    useListMarkets(cultureParams, { query: { queryKey: getListMarketsQueryKey(cultureParams), refetchInterval: 30000 } });

  const styleParams = { category: "STYLE" as const, status: "OPEN" as const, limit: 4 };
  const { data: styleData, isLoading: loadingStyle, isError: styleError, refetch: refetchStyle } =
    useListMarkets(styleParams, { query: { queryKey: getListMarketsQueryKey(styleParams), refetchInterval: 30000 } });

  const upcomingParams = { status: "SCHEDULED" as const, limit: 4 };
  const { data: upcomingData, isLoading: loadingUpcoming, isError: upcomingError, refetch: refetchUpcoming } =
    useListMarkets(upcomingParams, { query: { queryKey: getListMarketsQueryKey(upcomingParams), refetchInterval: 60000 } });

  const resolvedParams = { status: "RESOLVED" as const, limit: 3 };
  const { data: resolvedData, isLoading: loadingResolved, isError: resolvedError, refetch: refetchResolved } =
    useListMarkets(resolvedParams, { query: { queryKey: getListMarketsQueryKey(resolvedParams), refetchInterval: 60000 } });

  const { data: meData } = useGetMe({ query: { enabled: !!user } });
  const { data: pinsRaw, isLoading: loadingPins, isError: pinsError, refetch: refetchPins } =
    useGetUserPins(Number(user?.id), { query: { enabled: !!user?.id } });
  const pinsData = (pinsRaw as any)?.pins as any[] | undefined;

  // Derive Daily 5 from trending
  const allTrending = trendingData?.markets ?? [];
  const daily5Markets = allTrending.slice(0, 5);
  const buzzingNow = allTrending.slice(5);
  const { visited, markVisited, count: calledCount } = useDailyProgress(daily5Markets.map(m => m.id));

  return (
    <div className="pb-24">

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border/40 bg-muted/10">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] opacity-[0.06] bg-cover bg-center mix-blend-luminosity pointer-events-none" />
        <div className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-20 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-5">
              <Zap className="w-3.5 h-3.5" style={{ color: "hsl(43 72% 48%)" }} />
              Boston's Cultural Prediction Engine
            </div>
            <h1 className="text-5xl md:text-7xl font-editorial font-bold leading-[1.05] tracking-tight mb-3">
              {user && meData && 'username' in (meData as any)
                ? `Welcome back, ${(meData as any).username}.`
                : "Call what's next."}
            </h1>
            <p className="text-base font-bold tracking-widest uppercase text-muted-foreground mb-8" style={{ letterSpacing: "0.14em" }}>
              What's hot. What's not. What's next.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/markets">
                <Button size="lg" className="h-12 px-7 rounded-full font-bold">
                  Explore Markets <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              {!user ? (
                <Link href="/auth">
                  <Button size="lg" variant="outline" className="h-12 px-7 rounded-full border-foreground/20">
                    Join BuzzOrBoo — It's Free
                  </Button>
                </Link>
              ) : (
                <Link href={`/profile/${user.id}`}>
                  <Button size="lg" variant="outline" className="h-12 px-7 rounded-full border-foreground/20">
                    My Calls <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              )}
            </div>
            {stats && (stats.totalUsers ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground/60 mt-5">
                <span className="font-mono-numbers font-semibold text-foreground/70">{formatNumber(stats.totalUsers ?? 0)}</span>{" "}
                {stats.totalUsers === 1 ? "forecaster has" : "forecasters have"} already made their call.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ─── TODAY ON BUZZORBOO ───────────────────────────────────────── */}
      <section className="py-14 md:py-20 border-b border-border/30">
        <div className="container mx-auto px-4">
          <SectionHeader
            label="Today on BuzzOrBoo"
            title="What's worth having an opinion about."
            href="/markets"
            linkLabel="All markets →"
          />

          {loadingTrending ? (
            <LoadingSkeleton count={3} height="h-80" />
          ) : trendingError ? (
            <ErrorState onRetry={refetchTrending} />
          ) : daily5Markets.length === 0 ? (
            <EmptyState emoji="🎯" message="No markets open right now — check back soon." href="/markets" linkLabel="Browse all markets" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-[320px]">
              {daily5Markets.map((market, i) => (
                <div
                  key={market.id}
                  className="relative"
                  onClick={() => markVisited(market.id)}
                >
                  <FormatCard market={market} featured={i === 0} />
                  {visited.has(market.id) && (
                    <div className="absolute top-3 right-3 z-20 bg-primary rounded-full p-0.5 shadow-md pointer-events-none">
                      <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── THE DAILY 5 ──────────────────────────────────────────────── */}
      {daily5Markets.length > 0 && (
        <section className="py-14 border-b border-border/30 bg-muted/20">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-primary">The Daily 5</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-editorial font-bold">Five calls to make today.</h2>
              </div>
              {/* Progress counter */}
              <div className="flex flex-col items-end gap-1">
                <span className="text-3xl font-editorial font-bold tabular-nums">
                  {calledCount}<span className="text-muted-foreground/50 text-xl"> / 5</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Called</span>
              </div>
            </div>

            {calledCount >= 5 ? (
              <div className="py-12 text-center bg-primary/5 border border-primary/20 rounded-2xl flex flex-col items-center gap-3">
                <span className="text-4xl">5/5</span>
                <p className="font-editorial font-bold text-xl">You've made today's calls.</p>
                <p className="text-sm text-muted-foreground">Come back tomorrow.</p>
              </div>
            ) : (
              <>
                {/* Progress dots */}
                <div className="flex gap-2 mb-6">
                  {daily5Markets.map((m, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${visited.has(m.id) ? "bg-primary" : "bg-muted"}`} />
                  ))}
                </div>
                {/* Compact market list */}
                <div className="flex flex-col gap-3">
                  {daily5Markets.map((market) => {
                    const done = visited.has(market.id);
                    return (
                      <Link key={market.id} href={`/markets/${market.id}`} onClick={() => markVisited(market.id)}>
                        <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:border-primary/30 hover:shadow-sm ${done ? "bg-muted/40 border-border/30 opacity-60" : "bg-card border-border/50"}`}>
                          <div className="shrink-0">
                            {done
                              ? <CheckCircle2 className="w-5 h-5 text-primary" />
                              : <Circle className="w-5 h-5 text-muted-foreground/40" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm leading-snug line-clamp-2 ${done ? "line-through text-muted-foreground" : ""}`}>
                              {market.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">
                              {(market as any).marketFormat?.replace(/_/g, " ")}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* ─── BUZZING NOW ──────────────────────────────────────────────── */}
      {buzzingNow.length > 0 && (
        <section className="py-14 border-b border-border/30">
          <div className="container mx-auto px-4">
            <SectionHeader
              label="Buzzing Now"
              emoji="🔥"
              title="What Boston's talking about."
              href="/markets"
              linkLabel="All markets →"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-[300px]">
              {buzzingNow.map((market) => (
                <FormatCard key={market.id} market={market} />
              ))}
            </div>
            <div className="mt-6 md:hidden">
              <Link href="/markets"><Button variant="outline" className="w-full">More Markets <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── BOSTON ───────────────────────────────────────────────────── */}
      {(loadingBoston || bostonError || bostonData != null) && (
        <section className="py-14 border-b border-border/30 bg-muted/20">
          <div className="container mx-auto px-4">
            <SectionHeader
              label="Boston"
              emoji="📍"
              title="Your city. Your call."
              subtitle="Local pulse — the questions only Bostonians can answer."
              href="/markets?category=LOCAL_PULSE"
              linkLabel="All Boston →"
              count={bostonData?.total}
            />
            {loadingBoston ? <LoadingSkeleton count={3} height="h-64" /> :
              bostonError ? <ErrorState onRetry={refetchBoston} /> :
              (bostonData?.markets?.length ?? 0) === 0 ? (
                <EmptyState emoji="📍" message="No Boston markets open right now." href="/markets?category=LOCAL_PULSE" linkLabel="Browse all Boston" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-[300px]">
                  {bostonData?.markets?.slice(0, 6).map((market, i) => (
                    <FormatCard key={market.id} market={market} featured={i === 0} />
                  ))}
                </div>
              )}
            <div className="mt-6 md:hidden">
              <Link href="/markets?category=LOCAL_PULSE"><Button variant="outline" className="w-full">All Boston Markets <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── BATTLES ──────────────────────────────────────────────────── */}
      {(loadingBattles || battlesError || battlesData != null) && (
        <section className="py-14 border-b border-border/30">
          <div className="container mx-auto px-4">
            <SectionHeader
              label="Battles"
              emoji="⚔️"
              title="Two sides. Pick one."
              subtitle="Which wins? Cast your call and see where the crowd stands."
              href="/markets?format=HEAD_TO_HEAD"
              linkLabel="All Battles →"
              count={battlesData?.total}
            />
            {loadingBattles ? <LoadingSkeleton count={2} height="h-72" /> :
              battlesError ? <ErrorState onRetry={refetchBattles} /> :
              (battlesData?.markets?.length ?? 0) === 0 ? (
                <EmptyState emoji="⚔️" message="No Battle markets open right now." href="/markets?format=HEAD_TO_HEAD" linkLabel="Browse all Battles" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 auto-rows-[320px]">
                  {battlesData?.markets?.slice(0, 4).map((market, i) => (
                    <FormatCard key={market.id} market={market} featured={i === 0} />
                  ))}
                </div>
              )}
            <div className="mt-6 md:hidden">
              <Link href="/markets?format=HEAD_TO_HEAD"><Button variant="outline" className="w-full">All Battles <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── FORECASTS ────────────────────────────────────────────────── */}
      {(loadingForecast || forecastError || forecastData != null) && (
        <section className="py-14 border-b border-border/30 bg-muted/20">
          <div className="container mx-auto px-4">
            <SectionHeader
              label="Forecasts"
              emoji="🔮"
              title="What happens next?"
              subtitle="These resolve on a date. We're going to find out."
              href="/markets?format=STANDARD"
              linkLabel="All Forecasts →"
              count={forecastData?.total}
            />
            {loadingForecast ? <LoadingSkeleton count={3} height="h-56" /> :
              forecastError ? <ErrorState onRetry={refetchForecast} /> :
              (forecastData?.markets?.length ?? 0) === 0 ? (
                <EmptyState emoji="🔮" message="No Forecast markets open right now." href="/markets?format=STANDARD" linkLabel="Browse all Forecasts" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {forecastData?.markets?.slice(0, 6).map((market) => (
                    <MarketCard key={market.id} market={market as any} />
                  ))}
                </div>
              )}
            <div className="mt-6 md:hidden">
              <Link href="/markets?format=STANDARD"><Button variant="outline" className="w-full">All Forecasts <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── CULTURE ──────────────────────────────────────────────────── */}
      {(loadingCulture || cultureError || cultureData != null) && (
        <section className="py-14 border-b border-border/30">
          <div className="container mx-auto px-4">
            <SectionHeader
              label="Culture"
              emoji="👀"
              title="What's happening. What's over."
              href="/markets?category=CULTURE"
              linkLabel="All Culture →"
              count={cultureData?.total}
            />
            {loadingCulture ? <LoadingSkeleton count={2} height="h-64" /> :
              cultureError ? <ErrorState onRetry={refetchCulture} /> :
              (cultureData?.markets?.length ?? 0) === 0 ? (
                <EmptyState emoji="👀" message="No Culture markets open right now." href="/markets?category=CULTURE" linkLabel="Browse all Culture" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-[280px]">
                  {cultureData?.markets?.slice(0, 4).map((market, i) => (
                    <FormatCard key={market.id} market={market} featured={i === 0} />
                  ))}
                </div>
              )}
            <div className="mt-6 md:hidden">
              <Link href="/markets?category=CULTURE"><Button variant="outline" className="w-full">All Culture Markets <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── STYLE ────────────────────────────────────────────────────── */}
      {(loadingStyle || styleError || styleData != null) && (
        <section className="py-14 border-b border-border/30 bg-muted/20">
          <div className="container mx-auto px-4">
            <SectionHeader
              label="Style"
              title="Fashion. Beauty. The stuff people actually argue about."
              href="/markets?category=STYLE"
              linkLabel="All Style →"
              count={styleData?.total}
            />
            {loadingStyle ? <LoadingSkeleton count={2} height="h-64" /> :
              styleError ? <ErrorState onRetry={refetchStyle} /> :
              (styleData?.markets?.length ?? 0) === 0 ? (
                <EmptyState emoji="✨" message="No Style markets open right now." href="/markets?category=STYLE" linkLabel="Browse all Style" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-[280px]">
                  {styleData?.markets?.slice(0, 4).map((market, i) => (
                    <FormatCard key={market.id} market={market} featured={i === 0} />
                  ))}
                </div>
              )}
            <div className="mt-6 md:hidden">
              <Link href="/markets?category=STYLE"><Button variant="outline" className="w-full">All Style Markets <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── MORE QUESTIONS ───────────────────────────────────────────── */}
      <section className="py-10 border-b border-border/30 text-center">
        <div className="container mx-auto px-4">
          <Link href="/markets">
            <Button size="lg" variant="outline" className="h-14 px-10 rounded-full text-base font-bold border-foreground/20 hover:border-primary/40 gap-2">
              More Questions <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          {forecastData?.total != null && (
            <p className="text-xs text-muted-foreground mt-3">
              {(forecastData.total + (battlesData?.total ?? 0) + (bostonData?.total ?? 0) + (cultureData?.total ?? 0) + (styleData?.total ?? 0))}+ open markets across all categories
            </p>
          )}
        </div>
      </section>

      {/* ─── PINNED MARKETS (auth only) ───────────────────────────────── */}
      {user && loadingPins && (
        <section className="py-10 border-b border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-2 mb-5">
              <Bookmark className="w-4 h-4 text-muted-foreground" />
              <div className="h-5 w-32 bg-muted/60 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted/40 rounded-xl animate-pulse" />)}
            </div>
          </div>
        </section>
      )}
      {user && !loadingPins && pinsError && (
        <section className="py-10 border-b border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-2 mb-4">
              <Bookmark className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-lg font-editorial font-bold">Your Pinned Markets</h2>
            </div>
            <ErrorState onRetry={refetchPins} />
          </div>
        </section>
      )}
      {user && pinsData && pinsData.length > 0 && (
        <section className="py-10 border-b border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-5">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-editorial font-bold">Your Pinned Markets</h2>
              </div>
              <Link href={`/profile/${user.id}`}>
                <Button variant="ghost" size="sm">View all{pinsData.length > 3 ? ` (${pinsData.length})` : ""}</Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {pinsData.slice(0, 3).map((m: any) => <FormatCard key={m.id} market={m} />)}
            </div>
          </div>
        </section>
      )}

      {/* ─── UPCOMING ─────────────────────────────────────────────────── */}
      {(loadingUpcoming || upcomingError || upcomingData != null) && (
        <section className="py-14 border-b border-border/30 bg-muted/20">
          <div className="container mx-auto px-4">
            <SectionHeader
              label="Opening Soon"
              title={`Upcoming Markets${upcomingData?.total != null && upcomingData.total > 0 ? ` (${upcomingData.total})` : ""}`}
              subtitle="Get ready — these open soon."
              href="/markets?status=SCHEDULED"
              linkLabel="View all →"
            />
            {loadingUpcoming ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-36 bg-muted rounded-xl" />)}
              </div>
            ) : upcomingError ? <ErrorState onRetry={refetchUpcoming} /> :
            (upcomingData?.markets?.length ?? 0) === 0 ? (
              <EmptyState emoji="🗓" message="No markets scheduled right now." href="/markets?status=OPEN" linkLabel="Browse open markets" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(upcomingData?.markets ?? []).slice(0, 8).map(m => <FormatCard key={m.id} market={m} />)}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── RECENTLY RESOLVED ────────────────────────────────────────── */}
      {(loadingResolved || resolvedError || resolvedData != null) && (
        <section className="py-14 border-b border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Final Verdicts</span>
                </div>
                <h2 className="text-2xl font-editorial font-bold">Recently Resolved</h2>
                <p className="text-muted-foreground text-sm mt-1">The crowd has spoken.</p>
              </div>
              <Link href="/markets?status=RESOLVED">
                <Button variant="ghost" size="sm" className="hidden md:flex gap-1 text-muted-foreground hover:text-foreground">
                  See all <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
            {loadingResolved ? <LoadingSkeleton count={3} height="h-56" /> :
              resolvedError ? <ErrorState onRetry={refetchResolved} /> :
              (resolvedData?.markets?.length ?? 0) === 0 ? (
                <EmptyState emoji="🔍" message="No resolved markets yet." href="/markets?status=OPEN" linkLabel="Browse open markets" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {resolvedData?.markets?.slice(0, 3).map(m => <FormatCard key={m.id} market={m as any} />)}
                </div>
              )}
            <div className="mt-6 md:hidden">
              <Link href="/markets?status=RESOLVED"><Button variant="outline" className="w-full">See All Resolved <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── FOOTER CTA ───────────────────────────────────────────────── */}
      <section className="py-16 px-4 text-center bg-gradient-to-b from-background to-muted/40">
        <div className="max-w-md mx-auto">
          {user ? (
            <>
              <div className="text-4xl mb-4">⚡</div>
              <h2 className="font-editorial text-3xl font-bold mb-3">Your next call is waiting.</h2>
              <p className="text-muted-foreground mb-6">Every correct call raises your BuzzScore.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/markets?status=OPEN">
                  <Button size="lg" className="rounded-full px-8 font-bold gap-2 w-full sm:w-auto">
                    Make a Call <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link href={`/profile/${user.id}`}>
                  <Button size="lg" variant="outline" className="rounded-full px-8 font-bold w-full sm:w-auto">My Calls</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-4xl mb-4">🎯</div>
              <h2 className="font-editorial text-3xl font-bold mb-3">Ready to make your call?</h2>
              <p className="text-muted-foreground mb-6">
                Join Boston forecasters and put your cultural intuition on the record.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/auth">
                  <Button size="lg" className="rounded-full px-8 font-bold gap-2 w-full sm:w-auto">
                    Join BuzzOrBoo — It's Free <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/markets">
                  <Button size="lg" variant="outline" className="rounded-full px-8 font-bold w-full sm:w-auto">
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
