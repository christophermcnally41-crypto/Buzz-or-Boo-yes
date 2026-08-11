import { useGetTrendingMarkets, useGetPlatformStats, useGetMarketCategories, useListMarkets, getListMarketsQueryKey } from "@workspace/api-client-react";
import { MarketCard } from "@/components/market-card";
import { BuzzOrBooCard } from "@/components/buzz-or-boo-card";
import { TheCallCard } from "@/components/the-call-card";
import { BostonSays } from "@/components/boston-says";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, TrendingUp, Activity, Users, Zap } from "lucide-react";
import { formatNumber, formatCompactNumber } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";

export default function Home() {
  const { data: trendingMarkets, isLoading: loadingMarkets } = useGetTrendingMarkets({ limit: 7 });
  const { data: stats } = useGetPlatformStats();
  const { data: categories } = useGetMarketCategories();
  const { data: hotOrNotData, isLoading: loadingHotOrNot } = useListMarkets({ format: "HOT_OR_NOT", status: "OPEN", limit: 6 });
  const buzzOrBooParams = { format: "BUZZ_OR_BOO" as const, status: "OPEN" as const, limit: 5 };
  const { data: buzzOrBooData, isLoading: loadingBuzzOrBoo } = useListMarkets(buzzOrBooParams, { query: { queryKey: getListMarketsQueryKey(buzzOrBooParams), refetchInterval: 15000 } });
  const theCallParams = { format: "THE_CALL" as const, status: "OPEN" as const, limit: 6 };
  const { data: theCallData, isLoading: loadingTheCall } = useListMarkets(theCallParams, { query: { queryKey: getListMarketsQueryKey(theCallParams), refetchInterval: 15000 } });

  return (
    <div className="pb-24">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50 bg-muted/20">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] opacity-[0.03] bg-cover bg-center mix-blend-luminosity pointer-events-none" />
        
        <div className="container mx-auto px-4 pt-20 pb-24 md:pt-32 md:pb-32 relative z-10">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
              <Zap className="w-4 h-4" style={{ color: "hsl(43 72% 48%)" }} />
              Boston's Cultural Prediction Engine
            </div>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-editorial font-bold leading-[1.05] tracking-tight text-balance mb-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
              Call what's next.
            </h1>
            <p className="text-base md:text-lg font-bold tracking-widest uppercase text-muted-foreground mb-4 animate-slide-up" style={{ animationDelay: "150ms", letterSpacing: "0.14em" }}>
              What's hot. What's better. What's next.
            </p>
            <p className="text-xl md:text-2xl text-muted-foreground font-medium text-balance max-w-2xl mb-10 animate-slide-up" style={{ animationDelay: "200ms" }}>
              Boston's cultural prediction platform. Make a call before everyone else and build a public record of how good you are at seeing what's coming.
            </p>
            <div className="flex flex-wrap items-center gap-4 animate-slide-up" style={{ animationDelay: "300ms" }}>
              <Link href="/markets">
                <Button size="lg" className="h-14 px-8 text-lg rounded-full">
                  Explore Markets <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="border-t border-border/50 bg-background/50 backdrop-blur-md">
          <div className="container mx-auto px-4 py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 divide-x divide-border/0 md:divide-border/50">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> Open Markets
                </span>
                <span className="text-3xl font-editorial font-bold text-foreground">
                  {stats ? formatNumber(stats.openMarkets) : "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1 md:px-6">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" /> Total Predictions
                </span>
                <span className="text-3xl font-editorial font-bold text-foreground">
                  {stats ? formatCompactNumber(stats.totalPredictions) : "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1 md:px-6">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> Forecasters
                </span>
                <span className="text-3xl font-editorial font-bold text-foreground">
                  {stats ? formatNumber(stats.totalUsers) : "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1 md:px-6">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> Avg Accuracy
                </span>
                <span className="text-3xl font-editorial font-bold text-primary">
                  {stats?.avgAccuracy ? `${stats.avgAccuracy.toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Quick Nav */}
      <section className="py-12 border-b border-border/30">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto hide-scrollbar gap-4 pb-4 -mb-4">
            {categories?.map((cat) => (
              <Link key={cat.category} href={`/markets?category=${cat.category}`}>
                <div className="flex-none flex items-center gap-3 px-6 py-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer whitespace-nowrap min-w-[200px] group">
                  <CategoryIcon category={cat.category} className="w-8 h-8 group-hover:scale-110 transition-transform" />
                  <div className="flex flex-col">
                    <span className="font-bold">{getCategoryLabel(cat.category)}</span>
                    <span className="text-xs text-muted-foreground font-mono-numbers">{cat.openMarkets} open markets</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trending Markets */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Trending Now</h2>
              <p className="text-muted-foreground font-medium">Where the smartest money is going today.</p>
            </div>
            <Link href="/markets">
              <Button variant="ghost" className="hidden md:flex">
                View All <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          {loadingMarkets ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-80 bg-muted rounded-xl" />
              ))}
            </div>
          ) : trendingMarkets?.markets && trendingMarkets.markets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[320px]">
              {trendingMarkets.markets.map((market, i) => (
                <MarketCard key={market.id} market={market} featured={i === 0} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-muted/30 rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground font-medium">No trending markets found.</p>
            </div>
          )}
          
          <div className="mt-10 text-center md:hidden">
            <Link href="/markets">
              <Button variant="outline" className="w-full">
                View All Markets <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Hot or Not */}
      {(loadingHotOrNot || (hotOrNotData?.markets && hotOrNotData.markets.length > 0)) && (
        <section className="py-16 md:py-24 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-bold uppercase tracking-widest mb-3">
                  🔥 Hot or Not
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Is Boston Feeling It?</h2>
                <p className="text-muted-foreground font-medium">Call whether these spots, trends &amp; names are heating up — or fading out.</p>
              </div>
              <Link href="/markets?format=HOT_OR_NOT">
                <Button variant="ghost" className="hidden md:flex">
                  See All <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingHotOrNot ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-72 bg-muted rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[300px]">
                {hotOrNotData?.markets?.map((market) => (
                  <MarketCard key={market.id} market={market} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Buzz or Boo */}
      {(loadingBuzzOrBoo || (buzzOrBooData?.markets && buzzOrBooData.markets.length > 0)) && (
        <section className="py-16 md:py-24 border-b border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-3" style={{ backgroundColor: "#CFEA3B22", color: "#CFEA3B", border: "1px solid #CFEA3B44" }}>
                  ⚡ Buzz or Boo
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Quick Verdicts</h2>
                <p className="text-muted-foreground font-medium">Is it buzzing or getting boo'd? Drop your verdict in seconds.</p>
              </div>
              <Link href="/markets?format=BUZZ_OR_BOO">
                <Button variant="ghost" className="hidden md:flex">
                  See All <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingBuzzOrBoo ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-64 bg-muted rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[280px]">
                {buzzOrBooData?.markets?.map((market) => (
                  <BuzzOrBooCard key={market.id} market={market} />
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
      {(loadingTheCall || (theCallData?.markets && theCallData.markets.length > 0)) && (
        <section className="py-16 md:py-24 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-3" style={{ backgroundColor: "#8B5CF622", color: "#8B5CF6", border: "1px solid #8B5CF644" }}>
                  🎯 The Call
                </div>
                <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-2">Make The Call</h2>
                <p className="text-muted-foreground font-medium">Pick the right answer before the crowd locks it in. Your track record is on the line.</p>
              </div>
              <Link href="/markets?format=THE_CALL">
                <Button variant="ghost" className="hidden md:flex">
                  See All <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>

            {loadingTheCall ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-72 bg-muted rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[320px]">
                {theCallData?.markets?.map((market) => (
                  <TheCallCard key={market.id} market={market} />
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

      {/* Boston Says — Opinion Polls */}
      <BostonSays />
    </div>
  );
}
