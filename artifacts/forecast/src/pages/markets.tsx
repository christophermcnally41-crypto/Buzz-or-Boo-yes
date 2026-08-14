import { useState, useEffect, useMemo, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useListMarkets, getListMarketsQueryKey } from "@workspace/api-client-react";
import { MarketCard } from "@/components/market-card";
import { BuzzOrBooCard } from "@/components/buzz-or-boo-card";
import { TheCallCard } from "@/components/the-call-card";
import { MultiChoiceCard } from "@/components/multi-choice-card";
import { HotOrNotCard } from "@/components/hot-or-not-card";
import { HeadToHeadCard } from "@/components/head-to-head-card";
import { getCategoryLabel, CATEGORIES } from "@/lib/categories";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, X, ArrowUpDown } from "lucide-react";

type SortKey = "default" | "closing-soon" | "most-popular" | "newest";

export default function Markets() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const urlFormat = params.get("format") ?? undefined;
  const urlCategory = params.get("category") ?? undefined;
  const urlStatus = params.get("status") ?? undefined;

  const [category, setCategory] = useState<string>(urlCategory ?? "ALL");
  const [marketSearch, setMarketSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [limit, setLimit] = useState(60);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(val: string) {
    setMarketSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  }

  // Sync category tab if URL changes; reset limit when any filter changes
  useEffect(() => {
    setCategory(urlCategory ?? "ALL");
    setLimit(60);
  }, [urlCategory, urlFormat, urlStatus]);

  const isHotOrNot = urlFormat === "HOT_OR_NOT";
  const isBuzzOrBoo = urlFormat === "BUZZ_OR_BOO";
  const isTheCall = urlFormat === "THE_CALL";
  const isMultiChoice = urlFormat === "MULTI_CHOICE";
  const isHeadToHead = urlFormat === "HEAD_TO_HEAD";
  const isStandard = urlFormat === "STANDARD";
  const hasFormatFilter = isHotOrNot || isBuzzOrBoo || isTheCall || isMultiChoice || isHeadToHead || isStandard;

  const resolvedStatus = urlStatus === "RESOLVED";

  const isScheduledView = urlStatus === "SCHEDULED";

  const listMarketsParams = {
    category: category !== "ALL" ? (category as any) : undefined,
    format: urlFormat as any,
    status: (urlStatus === "RESOLVED" ? "RESOLVED" : urlStatus === "CLOSED" ? "CLOSED" : urlStatus === "SCHEDULED" ? "SCHEDULED" : "OPEN") as any,
    limit,
  };
  const { data, isLoading, isError, refetch } = useListMarkets(listMarketsParams, {
    query: { queryKey: getListMarketsQueryKey(listMarketsParams), refetchInterval: (urlStatus === "OPEN" || !urlStatus) ? 15000 : false },
  });

  const filteredMarkets = useMemo(() => {
    let markets = data?.markets ?? [];
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      markets = markets.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.question.toLowerCase().includes(q) ||
        (m.subcategory ?? "").toLowerCase().includes(q)
      );
    }
    if (sortKey === "closing-soon") {
      markets = [...markets].sort((a, b) => {
        const aTime = (a as any).expireAt ? new Date((a as any).expireAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = (b as any).expireAt ? new Date((b as any).expireAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    } else if (sortKey === "most-popular") {
      markets = [...markets].sort((a, b) => (b.totalPredictions ?? 0) - (a.totalPredictions ?? 0));
    } else if (sortKey === "newest") {
      markets = [...markets].sort((a, b) => {
        const aTime = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
        const bTime = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
        return bTime - aTime;
      });
    }
    return markets;
  }, [data?.markets, debouncedSearch, sortKey]);

  function handleFormatChange(val: string) {
    const parts: string[] = [];
    if (val !== "ALL") parts.push(`format=${val}`);
    if (urlStatus) parts.push(`status=${urlStatus}`);
    if (category && category !== "ALL") parts.push(`category=${category}`);
    navigate(parts.length ? `/markets?${parts.join("&")}` : "/markets");
  }

  const activeFormat = urlFormat ?? "ALL";

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="bg-muted/30 border-b border-border/50 pt-10 pb-8 md:pt-16 md:pb-12">
        <div className="container mx-auto px-4">
          {hasFormatFilter ? (
            /* Format-filtered header — shared layout with category tabs */
            (() => {
              const fmtBadge = isMultiChoice
                ? { style: { backgroundColor: "#CFEA3B22", color: "#CFEA3B", border: "1px solid #CFEA3B44" }, label: "👑 Buzz Battle" }
                : isTheCall
                ? { style: { backgroundColor: "#8B5CF622", color: "#8B5CF6", border: "1px solid #8B5CF644" }, label: "🎯 The Call" }
                : isBuzzOrBoo
                ? { style: { backgroundColor: "#CFEA3B22", color: "#CFEA3B", border: "1px solid #CFEA3B44" }, label: "⚡ Buzz or Boo" }
                : isHotOrNot
                ? { style: { backgroundColor: "#f9731622", color: "#ea580c", border: "1px solid #f9731644" }, label: "🔥 Hot or Not" }
                : isHeadToHead
                ? { style: { backgroundColor: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f644" }, label: "⚔️ Head to Head" }
                : { style: { backgroundColor: "#6366f122", color: "#6366f1", border: "1px solid #6366f144" }, label: "📊 Forecast" };
              const fmtTitle = resolvedStatus
                ? (isMultiChoice ? "Race Results" : isTheCall ? "The Crowd Decided" : isBuzzOrBoo ? "Final Verdicts" : isHotOrNot ? "How Boston Called It" : isHeadToHead ? "The Scores Are In" : "Resolved Forecasts")
                : isScheduledView
                ? (isMultiChoice ? "Races Coming Soon" : isTheCall ? "Upcoming Calls" : isBuzzOrBoo ? "Verdicts Opening Soon" : isHotOrNot ? "Coming Soon" : isHeadToHead ? "Matchups Ahead" : "Upcoming Forecasts")
                : (isMultiChoice ? "Who Takes The Crown?" : isTheCall ? "Make The Call" : isBuzzOrBoo ? "Quick Verdicts" : isHotOrNot ? "Is Boston Feeling It?" : isHeadToHead ? "Two Sides. You Decide." : "Classic Forecasts");
              const fmtDesc = resolvedStatus
                ? "Closed for voting — see how the crowd called it and check the final outcomes."
                : isScheduledView
                ? "Not open yet — mark your calendar and be ready to make your call when they go live."
                : (isMultiChoice ? "Pick the winner before the votes come in. Back your call with points." : isTheCall ? "Pick the right answer before the crowd locks it in. Your track record is on the line." : isBuzzOrBoo ? "Is it buzzing or getting boo'd? Drop your verdict in seconds." : isHotOrNot ? "Call whether these spots, trends and names are heating up — or fading out fast." : isHeadToHead ? "Who wins the matchup? Cast your call in the ultimate Boston face-off." : "Yes or no. Right or wrong. Put your prediction on the line and see how the crowd calls it.");
              return (
                <>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4 ${(fmtBadge as any).className ?? ""}`} style={(fmtBadge as any).style}>
                    {fmtBadge.label}
                  </div>
                  <h1 className="text-4xl md:text-5xl font-editorial font-bold mb-4">{fmtTitle}</h1>
                  <p className="text-lg text-muted-foreground max-w-2xl mb-8">{fmtDesc}</p>
                  <div className="relative">
                    <Tabs value={category} onValueChange={(val) => {
                      setCategory(val);
                      const parts: string[] = [];
                      if (val !== "ALL") parts.push(`category=${val}`);
                      if (urlFormat) parts.push(`format=${urlFormat}`);
                      if (urlStatus) parts.push(`status=${urlStatus}`);
                      navigate(parts.length ? `/markets?${parts.join("&")}` : "/markets");
                    }} className="w-full overflow-x-auto scrollbar-hide">
                      <TabsList className="h-auto p-1 bg-background/50 backdrop-blur-sm border border-border/50 rounded-full inline-flex min-w-max">
                        <TabsTrigger value="ALL" className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background">All Categories</TabsTrigger>
                        {CATEGORIES.map(cat => (
                          <TabsTrigger key={cat} value={cat} className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background">{getCategoryLabel(cat)}</TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-muted/60 to-transparent md:hidden" />
                  </div>
                </>
              );
            })()
          ) : resolvedStatus ? (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4 bg-green-600/10 text-green-600 border border-green-600/20">
                ✓ Resolved Markets
              </div>
              <h1 className="text-4xl md:text-5xl font-editorial font-bold mb-4">How It All Played Out</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mb-8">
                See which calls were right and how the crowd did across every market that's been settled.
              </p>
              <div className="relative">
                <Tabs value={category} onValueChange={(val) => {
                  setCategory(val);
                  const parts: string[] = [];
                  if (val !== "ALL") parts.push(`category=${val}`);
                  if (urlFormat) parts.push(`format=${urlFormat}`);
                  parts.push(`status=RESOLVED`);
                  navigate(parts.length ? `/markets?${parts.join("&")}` : "/markets");
                }} className="w-full overflow-x-auto scrollbar-hide">
                  <TabsList className="h-auto p-1 bg-background/50 backdrop-blur-sm border border-border/50 rounded-full inline-flex min-w-max">
                    <TabsTrigger value="ALL" className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background">All Categories</TabsTrigger>
                    {CATEGORIES.map(cat => (
                      <TabsTrigger key={cat} value={cat} className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background">{getCategoryLabel(cat)}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-muted/60 to-transparent md:hidden" />
              </div>
            </>
          ) : isScheduledView ? (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>
                🗓 Coming Soon
              </div>
              <h1 className="text-4xl md:text-5xl font-editorial font-bold mb-4">Upcoming Markets</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mb-8">
                These markets open soon. Bookmark them now and be ready to make your call the moment they go live.
              </p>
              <div className="relative">
                <Tabs value={category} onValueChange={(val) => {
                  setCategory(val);
                  const parts: string[] = [];
                  if (val !== "ALL") parts.push(`category=${val}`);
                  if (urlFormat) parts.push(`format=${urlFormat}`);
                  parts.push(`status=SCHEDULED`);
                  navigate(parts.length ? `/markets?${parts.join("&")}` : "/markets");
                }} className="w-full overflow-x-auto scrollbar-hide">
                  <TabsList className="h-auto p-1 bg-background/50 backdrop-blur-sm border border-border/50 rounded-full inline-flex min-w-max">
                    <TabsTrigger value="ALL" className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background">All Categories</TabsTrigger>
                    {CATEGORIES.map(cat => (
                      <TabsTrigger key={cat} value={cat} className="rounded-full px-5 py-2.5 text-sm font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background">{getCategoryLabel(cat)}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-muted/60 to-transparent md:hidden" />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-4xl md:text-5xl font-editorial font-bold mb-4">Open Forecasts</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mb-6">
                Browse every open market. Filter by format or category — pick a side and put your BuzzScore on the line.
              </p>

              <div className="relative">
                <Tabs value={category} onValueChange={(val) => {
                  setCategory(val);
                  const parts: string[] = [];
                  if (val !== "ALL") parts.push(`category=${val}`);
                  if (urlFormat) parts.push(`format=${urlFormat}`);
                  if (urlStatus) parts.push(`status=${urlStatus}`);
                  navigate(parts.length ? `/markets?${parts.join("&")}` : "/markets");
                }} className="w-full overflow-x-auto scrollbar-hide">
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
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-muted/60 to-transparent md:hidden" />
              </div>
            </>
          )}

          {/* Status filter */}
          <div className="relative mt-6">
          <div className="flex flex-nowrap gap-2 overflow-x-auto scrollbar-hide">
            {[
              { statusParam: undefined, label: "🟢 Open", active: !resolvedStatus && !isScheduledView && urlStatus !== 'CLOSED' },
              { statusParam: "SCHEDULED", label: "🗓 Scheduled", active: isScheduledView },
              { statusParam: "RESOLVED", label: "✓ Resolved", active: resolvedStatus },
              { statusParam: "CLOSED", label: "🔒 Closed", active: urlStatus === 'CLOSED' },
            ].map(({ statusParam, label, active }) => {
              const parts: string[] = [];
              if (urlFormat) parts.push(`format=${urlFormat}`);
              if (statusParam) parts.push(`status=${statusParam}`);
              if (category && category !== "ALL") parts.push(`category=${category}`);
              const href = parts.length ? `/markets?${parts.join("&")}` : "/markets";
              return (
              <a
                key={statusParam ?? "open"}
                href={href}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all no-underline ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border/50 hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {label}
              </a>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-muted/60 to-transparent md:hidden" />
          </div>

          {/* Format filter — shown on all views */}
          <div className="relative mt-3">
            <div className="flex flex-nowrap gap-2 overflow-x-auto scrollbar-hide items-center">
              {[
                { value: "ALL", label: "All Formats" },
                { value: "HOT_OR_NOT", label: "🔥 Hot or Not" },
                { value: "BUZZ_OR_BOO", label: "⚡ Buzz or Boo" },
                { value: "THE_CALL", label: "🎯 The Call" },
                { value: "MULTI_CHOICE", label: "👑 Buzz Battle" },
                { value: "HEAD_TO_HEAD", label: "⚔️ Head to Head" },
                { value: "STANDARD", label: "📊 Forecast" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleFormatChange(value)}
                  aria-pressed={activeFormat === value}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 ${
                    activeFormat === value
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent text-muted-foreground border-border/50 hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
              {(activeFormat !== "ALL" || urlStatus) && (
                <a
                  href="/markets"
                  className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border border-dashed border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all no-underline"
                >
                  ✕ Clear filters
                </a>
              )}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-muted/60 to-transparent md:hidden" />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
          <div className="flex items-center gap-3 flex-1">
            <h2 className="text-xl font-bold">
              {resolvedStatus
                ? (isBuzzOrBoo ? "Resolved Buzz or Boo" : isHotOrNot ? "Resolved Hot or Not" : isTheCall ? "Resolved The Call" : isMultiChoice ? "Resolved Buzz Battle" : "Resolved Markets")
                : isScheduledView
                ? (isBuzzOrBoo ? "Upcoming Buzz or Boo" : isHotOrNot ? "Upcoming Hot or Not" : isTheCall ? "Upcoming The Call" : isMultiChoice ? "Upcoming Buzz Battle" : "Upcoming Markets")
                : (isBuzzOrBoo ? "All Buzz or Boo Markets" : isHotOrNot ? "All Hot or Not Markets" : isTheCall ? "All The Call Markets" : isMultiChoice ? "All Buzz Battle Markets" : "Open Forecasts")}
            </h2>
            {resolvedStatus && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/10 text-green-600 border border-green-600/20 font-medium shrink-0">✓ Resolved</span>
            )}
            {isScheduledView && !resolvedStatus && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>🗓 Coming Soon</span>
            )}
            <Badge variant="secondary" className="font-mono-numbers">
              {marketSearch
                ? `${filteredMarkets.length} result${filteredMarkets.length !== 1 ? "s" : ""} for "${marketSearch}"`
                : (data?.total || 0)}
            </Badge>
          </div>
          {/* Sort + Search row */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Sort control — only meaningful for open markets */}
            {!resolvedStatus && !isScheduledView && (
              <div className="relative">
                <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort markets"
                  className="pl-8 pr-6 h-9 rounded-lg border border-input bg-background text-sm shadow-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer appearance-none"
                >
                  <option value="default">Default</option>
                  <option value="closing-soon">Closing Soon</option>
                  <option value="most-popular">Most Popular</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            )}
            {/* Search */}
            <div className="relative w-full md:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={marketSearch}
                onChange={e => handleSearchChange(e.target.value)}
                aria-label="Search markets"
                placeholder={activeFormat !== "ALL" ? `Search ${
                  activeFormat === "HOT_OR_NOT" ? "Hot or Not" :
                  activeFormat === "BUZZ_OR_BOO" ? "Buzz or Boo" :
                  activeFormat === "THE_CALL" ? "The Call" :
                  activeFormat === "MULTI_CHOICE" ? "Buzz Battle" :
                  activeFormat === "HEAD_TO_HEAD" ? "Head to Head" :
                  "Forecast"} markets…` : "Search markets…"}
                className="w-full pl-9 pr-8 h-9 rounded-lg border border-input bg-background text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {marketSearch && (
                <button
                  onClick={() => { setMarketSearch(""); setDebouncedSearch(""); }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-80 bg-muted/50 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-24 text-center flex flex-col items-center justify-center bg-card rounded-2xl border border-dashed border-destructive/30">
            <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center text-2xl mb-4">📡</div>
            <h3 className="text-lg font-editorial font-bold mb-1">Couldn't load markets</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">There was a problem reaching the server. Check your connection and try again.</p>
            <button onClick={() => refetch()} className="px-5 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity">Try again</button>
          </div>
        ) : filteredMarkets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMarkets.map((market, idx) => (
              <div
                key={market.id}
                className="animate-fade-in"
                style={{ animationDelay: `${Math.min(idx * 40, 400)}ms`, animationFillMode: 'both' }}
              >
                {isBuzzOrBoo || market.marketFormat === "BUZZ_OR_BOO" ? (
                  <BuzzOrBooCard market={market} />
                ) : isTheCall || market.marketFormat === "THE_CALL" ? (
                  <TheCallCard market={market} />
                ) : isMultiChoice || market.marketFormat === "MULTI_CHOICE" ? (
                  <MultiChoiceCard market={market as any} />
                ) : isHotOrNot || market.marketFormat === "HOT_OR_NOT" ? (
                  <HotOrNotCard market={market} />
                ) : isHeadToHead || market.marketFormat === "HEAD_TO_HEAD" ? (
                  <HeadToHeadCard market={market as any} />
                ) : (
                  <MarketCard market={market} />
                )}
              </div>
            ))}
          </div>
        ) : null}
        {/* Load-more — when total exceeds the fetched limit and no active search filter */}
        {!isError && filteredMarkets.length > 0 && !debouncedSearch && data?.total !== undefined && data.total > limit && (
          <div className="mt-10 flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Showing {filteredMarkets.length} of {data.total} markets
            </p>
            <button
              onClick={() => setLimit(l => l + 60)}
              disabled={isLoading}
              className="px-6 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                  Loading…
                </>
              ) : "Load more"}
            </button>
          </div>
        )}
        {!isError && filteredMarkets.length > 0 && !debouncedSearch && data?.total !== undefined && filteredMarkets.length >= data.total && filteredMarkets.length >= 5 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            You've seen all {data.total} market{data.total === 1 ? '' : 's'} — that's everything!
          </p>
        )}
        {isError ? null : filteredMarkets.length > 0 ? null : (
          <div className="py-32 text-center flex flex-col items-center justify-center bg-card rounded-2xl border border-dashed border-border">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-2xl mb-4">
              {marketSearch ? "🔍" : "📭"}
            </div>
            <h3 className="text-xl font-editorial font-bold mb-2">
              {marketSearch
                ? `No results for "${marketSearch}"`
                : resolvedStatus
                  ? (isHotOrNot ? "No resolved Hot or Not markets yet"
                  : isBuzzOrBoo ? "No resolved Buzz or Boo markets yet"
                  : isTheCall ? "No resolved The Call markets yet"
                  : isMultiChoice ? "No resolved Buzz Battle markets yet"
                  : isHeadToHead ? "No resolved Head to Head markets yet"
                  : isStandard ? "No resolved Forecast markets yet"
                  : "No resolved markets yet")
                : isScheduledView
                ? (isHotOrNot ? "No upcoming Hot or Not markets"
                  : isBuzzOrBoo ? "No upcoming Buzz or Boo markets"
                  : isTheCall ? "No upcoming The Call markets"
                  : isMultiChoice ? "No upcoming Buzz Battle markets"
                  : isHeadToHead ? "No upcoming Head to Head markets"
                  : isStandard ? "No upcoming Forecast markets"
                  : "No upcoming markets scheduled")
                : urlStatus === 'CLOSED'
                ? (isHotOrNot ? "No closed Hot or Not markets"
                  : isBuzzOrBoo ? "No closed Buzz or Boo markets"
                  : isTheCall ? "No closed The Call markets"
                  : isMultiChoice ? "No closed Buzz Battle markets"
                  : isHeadToHead ? "No closed Head to Head markets"
                  : isStandard ? "No closed Forecast markets"
                  : "No closed markets")
                : isHotOrNot ? "No active Hot or Not markets"
                : isBuzzOrBoo ? "No active Buzz or Boo markets"
                : isTheCall ? "No active The Call markets"
                : isMultiChoice ? "No active Buzz Battle markets"
                : isHeadToHead ? "No active Head to Head markets"
                : isStandard ? "No active Forecast markets"
                : "No active markets"}
            </h3>
            <p className="text-muted-foreground max-w-sm">
              {marketSearch
                ? "Try a different search term or clear the filter."
                : resolvedStatus
                ? "No settled markets match this filter yet. Check back after markets close."
                : isScheduledView
                ? "No upcoming markets in this filter. Check back soon — new markets are scheduled regularly."
                : urlStatus === 'CLOSED'
                ? "No markets have been administratively closed in this filter. Check the resolved section for settled markets."
                : activeFormat !== "ALL"
                ? "Nothing open in this format right now. Check back soon or explore other formats."
                : "We couldn't find any open markets here right now. Check back soon."}
            </p>
            {marketSearch && (
              <button onClick={() => { setMarketSearch(""); setDebouncedSearch(""); }} className="mt-4 text-sm text-primary hover:underline">Clear search</button>
            )}
            {!marketSearch && activeFormat !== "ALL" && (
              <button onClick={() => handleFormatChange("ALL")} className="mt-4 text-sm text-primary hover:underline">See all formats</button>
            )}
            {!marketSearch && (activeFormat !== "ALL" || urlStatus) && (
              <a href="/markets" className="block mt-2 text-sm text-muted-foreground hover:text-primary transition-colors">Clear all filters</a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
