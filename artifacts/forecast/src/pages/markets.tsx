import { useState } from "react";
import { useListMarkets } from "@workspace/api-client-react";
import { MarketCard } from "@/components/market-card";
import { getCategoryLabel, CATEGORIES } from "@/lib/categories";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function Markets() {
  const [category, setCategory] = useState<string>("ALL");
  
  const { data, isLoading } = useListMarkets({
    category: category !== "ALL" ? (category as any) : undefined,
    status: "OPEN",
    limit: 50
  });

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="bg-muted/30 border-b border-border/50 pt-10 pb-8 md:pt-16 md:pb-12">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-editorial font-bold mb-4">Markets</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Forecast the future across diverse cultural categories. Put your points where your mouth is.
          </p>

          <Tabs value={category} onValueChange={setCategory} className="w-full overflow-x-auto hide-scrollbar">
            <TabsList className="h-auto p-1 bg-background/50 backdrop-blur-sm border border-border/50 rounded-full inline-flex min-w-max">
              <TabsTrigger 
                value="ALL" 
                className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background"
              >
                All Markets
              </TabsTrigger>
              {CATEGORIES.map(cat => (
                <TabsTrigger 
                  key={cat} 
                  value={cat}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background"
                >
                  {getCategoryLabel(cat)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Grid */}
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Open Forecasts</h2>
            <Badge variant="secondary" className="font-mono-numbers">
              {data?.total || 0}
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-80 bg-muted/50 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : data?.markets && data.markets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.markets.map(market => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <div className="py-32 text-center flex flex-col items-center justify-center bg-card rounded-2xl border border-dashed border-border">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-2xl mb-4">
              📭
            </div>
            <h3 className="text-xl font-editorial font-bold mb-2">No active markets</h3>
            <p className="text-muted-foreground max-w-sm">
              We couldn't find any open markets in this category right now. Check back soon.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
