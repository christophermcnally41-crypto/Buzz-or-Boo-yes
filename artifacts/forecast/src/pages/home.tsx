import { useGetTrendingMarkets, useGetPlatformStats, useGetMarketCategories } from "@workspace/api-client-react";
import { MarketCard } from "@/components/market-card";
import { BostonSays } from "@/components/boston-says";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, TrendingUp, Activity, Users, Zap } from "lucide-react";
import { formatNumber, formatCompactNumber } from "@/lib/utils";
import { getCategoryLabel, getCategoryIcon } from "@/lib/categories";

export default function Home() {
  const { data: trendingMarkets, isLoading: loadingMarkets } = useGetTrendingMarkets({ limit: 7 });
  const { data: stats } = useGetPlatformStats();
  const { data: categories } = useGetMarketCategories();

  return (
    <div className="pb-24">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50 bg-muted/20">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] opacity-[0.03] bg-cover bg-center mix-blend-luminosity pointer-events-none" />
        
        <div className="container mx-auto px-4 pt-20 pb-24 md:pt-32 md:pb-32 relative z-10">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
              <Zap className="w-4 h-4" />
              The Cultural Prediction Engine
            </div>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-editorial font-bold leading-[1.05] tracking-tight text-balance mb-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
              See what's coming before everyone else does.
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground font-medium text-balance max-w-2xl mb-10 animate-slide-up" style={{ animationDelay: "200ms" }}>
              Forecast trends across style, culture, and cities. Earn reputation. Become an elite forecaster.
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
                  <span className="text-3xl group-hover:scale-110 transition-transform">{getCategoryIcon(cat.category)}</span>
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

      {/* Boston Says — Opinion Polls */}
      <BostonSays />
    </div>
  );
}
