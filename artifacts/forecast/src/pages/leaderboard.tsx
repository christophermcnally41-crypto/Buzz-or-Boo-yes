import { useState } from "react";
import { useGetLeaderboard } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCategoryLabel, CATEGORIES } from "@/lib/categories";
import { formatNumber, cn } from "@/lib/utils";
import { Trophy, TrendingUp, Award, Medal } from "lucide-react";
import { Link } from "wouter";

export default function Leaderboard() {
  const [category, setCategory] = useState<string>("OVERALL");
  
  const { data: leaderboard, isLoading } = useGetLeaderboard({
    category: category !== "OVERALL" ? (category as any) : undefined,
    limit: 100
  });

  const getTierInfo = (accuracy: number) => {
    if (accuracy >= 80) return { label: "Elite", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Trophy };
    if (accuracy >= 65) return { label: "Expert", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Medal };
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
          <h1 className="text-4xl md:text-5xl font-editorial font-bold mb-4">Top Forecasters</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            The platform's sharpest minds, ranked by prediction accuracy.
          </p>

          <Tabs value={category} onValueChange={setCategory} className="w-full overflow-x-auto hide-scrollbar">
            <TabsList className="h-auto p-1 bg-background/50 backdrop-blur-sm border border-border/50 rounded-full inline-flex min-w-max">
              <TabsTrigger 
                value="OVERALL" 
                className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Overall Rank
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
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/20 text-xs font-bold tracking-wider text-muted-foreground uppercase">
              <div className="col-span-2 md:col-span-1 text-center">Rank</div>
              <div className="col-span-6 md:col-span-5">Forecaster</div>
              <div className="hidden md:block md:col-span-3 text-center">Record</div>
              <div className="col-span-4 md:col-span-3 text-right pr-4">Accuracy</div>
            </div>

            <div className="divide-y divide-border">
              {leaderboard.map((entry) => {
                const tier = getTierInfo(entry.accuracy);
                const TierIcon = tier.icon;
                
                return (
                  <Link key={entry.user.id} href={`/profile/${entry.user.id}`}>
                    <div className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/30 transition-colors cursor-pointer group">
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
                          <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                            {entry.user.username}
                          </div>
                          <Badge variant="outline" className={cn("text-[10px] mt-1 hidden md:inline-flex", tier.color)}>
                            <TierIcon className="w-3 h-3 mr-1" /> {tier.label}
                          </Badge>
                        </div>
                      </div>

                      {/* Record */}
                      <div className="hidden md:flex md:col-span-3 flex-col items-center justify-center">
                        <div className="font-mono-numbers text-sm font-medium">
                          <span className="text-primary">{entry.totalCorrect}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-foreground">{entry.totalPredictions}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Resolved</span>
                      </div>

                      {/* Accuracy */}
                      <div className="col-span-4 md:col-span-3 text-right pr-2 md:pr-4 flex flex-col items-end">
                        <div className="font-mono-numbers text-xl font-bold flex items-center gap-1.5">
                          {entry.accuracy.toFixed(1)}%
                          {entry.accuracy >= 70 && <TrendingUp className="w-4 h-4 text-green-500" />}
                        </div>
                        {entry.tokensEarned && entry.tokensEarned > 0 && (
                          <div className="text-[10px] text-primary font-mono-numbers font-medium mt-1">
                            +{formatNumber(entry.tokensEarned)} FP
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
      </div>
    </div>
  );
}
