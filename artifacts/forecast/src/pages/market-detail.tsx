import { useParams } from "wouter";
import { 
  useGetMarket, 
  useGetMarketPredictions, 
  useGetMarketTally,
  useMakePrediction,
  useGetMe,
  useGetMarketPinStatus,
  usePinMarket,
  useUnpinMarket,
  useListMarkets,
  getGetMarketQueryKey,
  getGetMarketPredictionsQueryKey,
  getGetMarketTallyQueryKey,
  getGetMeQueryKey,
  getGetPlatformStatsQueryKey,
  getGetUserPredictionsQueryKey,
  getGetMarketPinStatusQueryKey,
  getGetUserPinsQueryKey,
  getListMarketsQueryKey,
} from "@workspace/api-client-react";
import { MarketCard } from "@/components/market-card";
import { BuzzOrBooCard } from "@/components/buzz-or-boo-card";
import { TheCallCard } from "@/components/the-call-card";
import { MultiChoiceCard } from "@/components/multi-choice-card";
import { HeadToHeadCard } from "@/components/head-to-head-card";
import { HotOrNotCard } from "@/components/hot-or-not-card";
import { CountdownBadge } from "@/components/countdown-badge";
import { ShareResultModal } from "@/components/share-result-modal";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { getCategoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { formatNumber, cn, formatTimeAgo } from "@/lib/utils";
import { getMarketColors } from "@/lib/market-colors";
import { ArrowLeft, Clock, Info, CheckCircle2, XCircle, LogIn, Crown, Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Database, FlaskConical, MapPin, Shield, Link2, Copy, Check, Share2 } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { computeCountdownState } from "@/lib/market-countdown";
import { getTallyRefetchInterval } from "@/lib/tally-poll";

const BUZZ_COLOR = "#CFEA3B";

function RelatedMarketsSection({ marketId, category, marketFormat }: { marketId: number; category: string; marketFormat?: string }) {
  // Prefer same-format markets; fall back to same-category if none found
  const { data: sameFormatData, isLoading: loadingFormat } = useListMarkets(
    { category: category as any, status: "OPEN", limit: 6, ...(marketFormat ? { format: marketFormat as any } : {}) },
    { query: { enabled: !!marketFormat, queryKey: getListMarketsQueryKey({ category: category as any, status: "OPEN", limit: 6, ...(marketFormat ? { format: marketFormat as any } : {}) }) } }
  );
  const { data: sameCategoryData, isLoading: loadingCategory } = useListMarkets({ category: category as any, status: "OPEN", limit: 6 });

  const isLoading = loadingCategory || (!!marketFormat && loadingFormat);
  const sameFormat = (sameFormatData?.markets ?? []).filter(m => m.id !== marketId);
  const sameCategory = (sameCategoryData?.markets ?? []).filter(m => m.id !== marketId);

  // Use same-format if we have any; otherwise fall back to same-category
  const related = (sameFormat.length >= 1 ? sameFormat : sameCategory).slice(0, 3);

  if (isLoading) return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="h-7 w-40 bg-muted/60 rounded-lg animate-pulse mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0,1,2].map(i => <div key={i} className="h-48 rounded-2xl bg-muted/40 animate-pulse" />)}
        </div>
      </CardContent>
    </Card>
  );
  if (related.length === 0) return (
    <Card className="mb-6">
      <CardContent className="p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">No similar open markets right now.</p>
        <Link href="/markets" className="text-xs text-primary hover:underline font-medium">
          Browse all markets →
        </Link>
      </CardContent>
    </Card>
  );

  const isSameFormat = sameFormat.length >= 1;
  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-editorial text-xl font-bold">
            {isSameFormat ? "More Like This" : `More in ${getCategoryLabel(category)}`}
          </h3>
          <Link
            href={isSameFormat ? `/markets?format=${marketFormat}` : `/markets?category=${category}`}
            className="text-xs text-primary hover:underline font-medium"
          >
            See all →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {related.map(m => {
            const fmt = (m as any).marketFormat;
            if (fmt === 'BUZZ_OR_BOO') return <BuzzOrBooCard key={m.id} market={m as any} />;
            if (fmt === 'THE_CALL') return <TheCallCard key={m.id} market={m as any} />;
            if (fmt === 'MULTI_CHOICE') return <MultiChoiceCard key={m.id} market={m as any} />;
            if (fmt === 'HEAD_TO_HEAD') return <HeadToHeadCard key={m.id} market={m as any} />;
            if (fmt === 'HOT_OR_NOT') return <HotOrNotCard key={m.id} market={m as any} />;
            return <MarketCard key={m.id} market={m} />;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

/**
 * Drives a per-second countdown display.
 *
 * Freeze guarantee: once the expiry timestamp passes, the hook clears the
 * interval immediately so the label is permanently frozen at "Closing soon"
 * and never decrements below zero.
 *
 * justExpired: set to true the first time the expiry is detected *during*
 * this session (i.e. the page was open when the market expired). Use it to
 * show a "refresh to see final result" nudge.
 */
function useMarketCountdown(
  market: any,
): { label: string | null; urgent: boolean; justExpired: boolean } {
  const clockType = market?.clockType as string | undefined;
  const expireAt = market?.expireAt as string | null | undefined;

  const compute = useCallback(
    () => computeCountdownState(clockType, expireAt, Date.now()),
    [clockType, expireAt],
  );

  const [state, setState] = useState(compute);
  const [justExpired, setJustExpired] = useState(false);
  // Track whether the timer was running (i.e. had a positive msLeft) so we can
  // detect the transition from "counting down" → "expired" during this session.
  const wasCountingRef = useRef(false);

  useEffect(() => {
    const initial = compute();
    setState(initial);

    if (!clockType || clockType === "EVERGREEN" || clockType === "RECURRING_PULSE" || !expireAt) {
      wasCountingRef.current = false;
      return;
    }

    if (initial.label !== "Closing soon") {
      // Market is still open — start counting
      wasCountingRef.current = true;
    }

    if (initial.label === "Closing soon") {
      // Already expired before this render — no interval needed
      wasCountingRef.current = false;
      return;
    }

    const id = setInterval(() => {
      const next = compute();
      setState(next);

      if (next.label === "Closing soon") {
        // Market just expired during this session
        if (wasCountingRef.current) {
          setJustExpired(true);
        }
        wasCountingRef.current = false;
        clearInterval(id);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [clockType, expireAt, compute]);

  return { ...state, justExpired };
}
const BOO_COLOR = "#E8503E";

function CopyLinkButton({ marketId }: { marketId: number }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const url = `${window.location.origin}/markets/${marketId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select a temporary input
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy link"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
    >
      {copied ? <><Check className="w-4 h-4 text-green-500" /> Copied</> : <><Link2 className="w-4 h-4" /> Share</>}
    </button>
  );
}

interface ResolutionRulesDrawerProps {
  market: {
    resolutionSource?: string | null;
    sourcePrimary?: string | null;
    sourceBackup?: string | null;
    baselineSnapshot?: string | null;
    formula?: string | null;
    voidRule?: string | null;
    geo?: string | null;
  };
}

function ResolutionRulesDrawer({ market }: ResolutionRulesDrawerProps) {
  const [open, setOpen] = useState(false);

  const rules = [
    { icon: <Database className="w-4 h-4" />, label: "Primary Source", value: market.sourcePrimary },
    { icon: <Database className="w-4 h-4 opacity-60" />, label: "Backup Source", value: market.sourceBackup },
    { icon: <FlaskConical className="w-4 h-4" />, label: "Formula", value: market.formula },
    { icon: <Info className="w-4 h-4" />, label: "Baseline Snapshot", value: market.baselineSnapshot },
    { icon: <Shield className="w-4 h-4" />, label: "Void Criteria", value: market.voidRule },
    { icon: <MapPin className="w-4 h-4" />, label: "Geography", value: market.geo },
  ].filter(r => r.value);

  // Don't render drawer if no rule fields are populated
  if (rules.length === 0 && !market.resolutionSource) return null;

  return (
    <div className="mt-4 rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-bold tracking-tight">Resolution Rules</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 py-4 space-y-4 bg-card border-t border-border">
          {market.resolutionSource && (
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Resolution Authority</div>
                {market.resolutionSource.startsWith('http') ? (
                  <a href={market.resolutionSource} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-2 break-all hover:opacity-80">
                    {market.resolutionSource} ↗
                  </a>
                ) : (
                  <div className="text-sm">{market.resolutionSource}</div>
                )}
              </div>
            </div>
          )}
          {rules.map(r => (
            <div key={r.label} className="flex items-start gap-3">
              <span className="text-muted-foreground shrink-0 mt-0.5">{r.icon}</span>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{r.label}</div>
                <div className="text-sm">{r.value}</div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/50">
            These rules are set at market creation and govern how this market resolves. Contact an admin if you have questions.
          </p>
        </div>
      )}
    </div>
  );
}
const BUZZ_OR_BOO_STAKE = 10; // fixed one-tap stake
const HOT_OR_NOT_STAKE = 10; // fixed one-tap stake

interface Contender {
  key: string;
  name: string;
  venue?: string;
}

interface MultiChoiceData {
  contenders: Contender[];
  metric?: string;
  period?: string;
}

function parseMultiChoiceData(desc: string | null | undefined): MultiChoiceData | null {
  if (!desc) return null;
  try {
    const p = JSON.parse(desc);
    if (Array.isArray(p.contenders)) return p as MultiChoiceData;
  } catch {}
  return null;
}

interface TheCallOption {
  key: string;
  label: string;
}

interface TheCallData {
  options: TheCallOption[];
  context?: string;
}

function parseTheCallData(desc: string | null | undefined): TheCallData | null {
  if (!desc) return null;
  try {
    const p = JSON.parse(desc);
    if (Array.isArray(p.options)) return p as TheCallData;
  } catch {}
  return null;
}

interface HeadToHeadData {
  entityA: string;
  entityB: string;
  metric?: string;
  period?: string;
  addressA?: string;
  addressB?: string;
  note?: string;
}

function parseHeadToHeadData(desc: string | null | undefined): HeadToHeadData | null {
  if (!desc) return null;
  try {
    const p = JSON.parse(desc);
    if (p.entityA && p.entityB) return p as HeadToHeadData;
  } catch {}
  return null;
}

const CONTENDER_COLORS = ["#CFEA3B", "#3ECDE8", "#E87B3E", "#8B5CF6", "#EC4899"];
const THE_CALL_COLORS = ["#CFEA3B", "#3ECDE8", "#E87B3E", "#8B5CF6", "#EC4899", "#22D3EE"];

const TOPUP_THRESHOLD = 500;
const THE_CALL_STAKE = 10;
export default function MarketDetail() {
  const params = useParams();
  const marketId = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: authUser, isAuthenticated, login } = useAuth();
  // Guest voting: track attempts in localStorage before showing sign-up wall
  const [guestVoteAttempts, setGuestVoteAttempts] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return parseInt(localStorage.getItem('boo_guest_votes') ?? '0', 10);
  });
  const [guestVoteChoice, setGuestVoteChoice] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const { data: market, isLoading, error: marketError } = useGetMarket(marketId, {
    query: { enabled: !!marketId, queryKey: getGetMarketQueryKey(marketId), refetchInterval: (q: any) => q.state.data?.status === 'OPEN' ? 30000 : false }
  });

  const { data: predictions, isError: isPredictionsError } = useGetMarketPredictions(marketId, {
    query: {
      enabled: !!marketId,
      queryKey: getGetMarketPredictionsQueryKey(marketId),
      refetchInterval: market?.status === "OPEN" ? 10000 : false,
    }
  });

  // Aggregate tally for all formats — uses server-side GROUP BY, accurate at any scale
  const { data: tallyData, isLoading: tallyLoading } = useGetMarketTally(marketId, {
    query: {
      enabled: !!marketId,
      queryKey: getGetMarketTallyQueryKey(marketId),
      refetchInterval: market?.marketFormat === "THE_CALL"
        ? (market?.status !== "CLOSED" && market?.status !== "RESOLVED" ? 15000 : false)
        : getTallyRefetchInterval(market?.status ?? ""),
    }
  });

  const { data: meData } = useGetMe({
    query: { enabled: isAuthenticated, queryKey: getGetMeQueryKey() }
  });

  const makePrediction = useMakePrediction();
  const pinMarket = usePinMarket();
  const unpinMarket = useUnpinMarket();

  const { data: pinStatus, refetch: refetchPin } = useGetMarketPinStatus(marketId, {
    query: { enabled: !!marketId && isAuthenticated, queryKey: getGetMarketPinStatusQueryKey(marketId) }
  });
  const isPinned = pinStatus?.pinned ?? false;

  const handlePin = () => {
    if (!isAuthenticated) { login(); return; }
    const userId = authUser ? parseInt(authUser.id, 10) : undefined;
    if (isPinned) {
      unpinMarket.mutate({ id: marketId }, {
        onSuccess: () => {
          refetchPin();
          if (userId) queryClient.invalidateQueries({ queryKey: getGetUserPinsQueryKey(userId) });
        }
      });
    } else {
      pinMarket.mutate({ id: marketId }, {
        onSuccess: () => {
          refetchPin();
          if (userId) queryClient.invalidateQueries({ queryKey: getGetUserPinsQueryKey(userId) });
          toast({ title: "Pinned!", description: "Saved to your profile." });
        }
      });
    }
  };

  const tokenBalance = meData?.tokenBalance ?? 0;
  const sliderMax = isAuthenticated ? Math.min(tokenBalance, 500) : 500;
  const sliderMin = Math.min(10, sliderMax);

  const [amount, setAmount] = useState([100]);
  const [isPredicting, setIsPredicting] = useState<string | null>(null);

  // Clamp amount if balance changed (functional update avoids adding `amount` to deps)
  useEffect(() => {
    setAmount(prev => (prev[0] > sliderMax ? [sliderMax] : prev));
  }, [sliderMax]);

  const countdown = useMarketCountdown(market);

  const isResolved = market?.status === "RESOLVED";
  const isClosed = market?.status === "CLOSED" || isResolved;
  const isScheduled = market?.status === "SCHEDULED";
  const isMultiChoice = market?.marketFormat === "MULTI_CHOICE";
  const isBuzzOrBoo = market?.marketFormat === "BUZZ_OR_BOO";
  const isTheCall = market?.marketFormat === "THE_CALL";
  const isHotOrNot = market?.marketFormat === "HOT_OR_NOT";
  const isHeadToHead = market?.marketFormat === "HEAD_TO_HEAD";

  const multiChoiceData = isMultiChoice ? parseMultiChoiceData(market?.description) : null;
  const theCallData = isTheCall ? parseTheCallData(market?.description) : null;
  const h2hData = isHeadToHead ? parseHeadToHeadData(market?.description) : null;

  // Compute per-contender vote counts from server-side tally (same source as feed card)
  const { contenderCounts, totalContenderVotes } = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!multiChoiceData) return { contenderCounts: counts, totalContenderVotes: 0 };
    for (const c of multiChoiceData.contenders) counts[c.key] = 0;
    if (tallyData?.tallies) {
      for (const [key, count] of Object.entries(tallyData.tallies)) {
        if (key in counts) counts[key] = count;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { contenderCounts: counts, totalContenderVotes: total };
  }, [multiChoiceData, tallyData]);

  // Compute per-option vote counts for THE_CALL from the server-side aggregate tally
  const theCallCounts: Record<string, number> = useMemo(() => {
    if (!theCallData) return {};
    const counts: Record<string, number> = {};
    for (const o of theCallData.options) {
      counts[o.key] = tallyData?.tallies?.[o.key] ?? 0;
    }
    return counts;
  }, [theCallData, tallyData]);

  const totalTheCallVotes = Object.values(theCallCounts).reduce((a, b) => a + b, 0);

  const handlePredict = (choice: string) => {
    if (!isAuthenticated || !authUser) {
      const newCount = guestVoteAttempts + 1;
      setGuestVoteAttempts(newCount);
      localStorage.setItem('boo_guest_votes', String(newCount));
      setGuestVoteChoice(choice);
      return;
    }

    const stake = isBuzzOrBoo ? BUZZ_OR_BOO_STAKE : isHotOrNot ? HOT_OR_NOT_STAKE : isTheCall ? THE_CALL_STAKE : amount[0];
    setIsPredicting(choice);
    const theCallLabel = isTheCall && theCallData
      ? (theCallData.options.find(o => o.key === choice)?.label ?? choice)
      : choice;
    makePrediction.mutate({
      id: marketId,
      data: {
        userId: parseInt(authUser.id, 10),
        choice,
        amount: stake
      }
    }, {
      onSuccess: () => {
        toast({
          title: isBuzzOrBoo ? "Verdict cast!" : isTheCall ? "Pick registered!" : isMultiChoice ? "Contender backed!" : "Prediction Cast!",
          description: isBuzzOrBoo
            ? `You voted ${choice === "YES" ? "⚡ BUZZ" : "👎 BOO"} on this one. ${formatNumber(BUZZ_OR_BOO_STAKE)} FP staked.`
            : isTheCall
            ? `Your pick: ${theCallLabel}. ${formatNumber(THE_CALL_STAKE)} FP staked.`
            : isMultiChoice
            ? `You backed ${multiChoiceData?.contenders.find(c => c.key === choice)?.name ?? choice} with ${formatNumber(stake)} FP.`
            : `You placed ${formatNumber(stake)} FP on ${choice}.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetMarketQueryKey(marketId) });
        queryClient.invalidateQueries({ queryKey: getGetMarketPredictionsQueryKey(marketId) });
        queryClient.invalidateQueries({ queryKey: getGetMarketTallyQueryKey(marketId) });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        if (authUser) queryClient.invalidateQueries({ queryKey: getGetUserPredictionsQueryKey(parseInt(authUser.id, 10)) });
        queryClient.invalidateQueries({ queryKey: getGetPlatformStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
        setIsPredicting(null);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || "Failed to cast prediction.";
        toast({ title: "Error", description: msg, variant: "destructive" });
        setIsPredicting(null);
      }
    });
  };

  const userPrediction = useMemo(() => {
    if (!predictions || !authUser) return null;
    const uid = parseInt(authUser.id, 10);
    return predictions.find(p => p.userId === uid) ?? null;
  }, [predictions, authUser]);

  const userTotalInvested = userPrediction?.amount ?? 0;

  // Set page title — must be before early returns to satisfy rules of hooks.
  // Extract primitives so the dep array contains stable scalars, not the object.
  const loadedMarketId = market?.id;
  const loadedMarketTitle = market?.title;
  useEffect(() => {
    if (!loadedMarketId || !loadedMarketTitle) return;
    document.title = `${loadedMarketTitle} — BuzzOrBoo`;
    return () => { document.title = "BuzzOrBoo \u2014 Call What's Next."; };
  }, [loadedMarketId, loadedMarketTitle]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Hero skeleton */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex gap-2">
                <div className="h-6 w-20 bg-muted/60 rounded-full animate-pulse" />
                <div className="h-6 w-16 bg-muted/60 rounded-full animate-pulse" />
                <div className="h-6 w-14 bg-muted/60 rounded-full animate-pulse" />
              </div>
              <div className="space-y-3">
                <div className="h-10 w-full bg-muted/60 rounded-2xl animate-pulse" />
                <div className="h-10 w-4/5 bg-muted/60 rounded-2xl animate-pulse" />
                <div className="h-10 w-3/5 bg-muted/60 rounded-2xl animate-pulse" />
              </div>
              <div className="h-5 w-48 bg-muted/40 rounded-full animate-pulse" />
              <div className="h-72 w-full bg-muted/40 rounded-3xl animate-pulse" />
              <div className="h-48 w-full bg-muted/40 rounded-3xl animate-pulse" />
            </div>
            {/* Sidebar skeleton */}
            <div className="lg:col-span-4 space-y-4">
              <div className="h-10 w-full bg-muted/60 rounded-2xl animate-pulse" />
              <div className="h-64 w-full bg-muted/40 rounded-3xl animate-pulse" />
              <div className="h-32 w-full bg-muted/40 rounded-3xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!market || marketError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="font-editorial text-3xl font-bold mb-2">Market not found</h1>
          <p className="text-muted-foreground mb-6">This market may have been removed or the link is incorrect.</p>
          <Link href="/markets">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" /> Browse Markets
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const yesPercent = market.yesPercent || 50;
  const noPercent = market.noPercent || 50;
  const colors = getMarketColors(market.id);

  // Derive live YES/NO from tally for all formats; fall back to market props
  const buzzTallyYes = tallyData?.tallies?.["YES"] ?? 0;
  const buzzTallyNo = tallyData?.tallies?.["NO"] ?? 0;
  const buzzTallyTotal = buzzTallyYes + buzzTallyNo;
  const liveBuzzPercent = isBuzzOrBoo && buzzTallyTotal > 0 ? (buzzTallyYes / buzzTallyTotal) * 100 : yesPercent;
  const liveBooPercent = isBuzzOrBoo && buzzTallyTotal > 0 ? (buzzTallyNo / buzzTallyTotal) * 100 : noPercent;
  // Standard / HOT_OR_NOT live vote counts from tally (falls back to market counts when tally is empty)
  const liveYesCount = buzzTallyTotal > 0 ? buzzTallyYes : (market.yesCount ?? 0);
  const liveNoCount = buzzTallyTotal > 0 ? buzzTallyNo : (market.noCount ?? 0);
  const liveTotalCount = liveYesCount + liveNoCount;
  const liveYesPercent = liveTotalCount > 0 ? (liveYesCount / liveTotalCount) * 100 : yesPercent;
  const liveNoPercent = liveTotalCount > 0 ? (liveNoCount / liveTotalCount) * 100 : noPercent;

  return (
    <div className="min-h-screen pb-24">
      {market.imageUrl && (
        <div className="w-full h-[40vh] relative">
          <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>
      )}

      {!market.imageUrl && (
        <div className="h-24 bg-gradient-to-b from-muted/40 to-transparent" />
      )}
      <div className={cn(
        "container mx-auto px-4 relative z-10",
        market.imageUrl ? "-mt-32" : "pt-4"
      )}>
        <Link href={`/markets${market.category ? `?category=${market.category}` : ''}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to {market.category ? `${getCategoryLabel(market.category)} markets` : 'Markets'}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Main Content */}
          <div className="lg:col-span-8">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-medium gap-1.5 py-1 px-3">
                  <CategoryIcon category={market.category} className="w-4 h-4" /> {getCategoryLabel(market.category)}
                </Badge>
                {market.marketFormat === "BUZZ_OR_BOO" && (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#CFEA3B22", color: "#CFEA3B", border: "1px solid #CFEA3B44" }}>⚡ Buzz or Boo</Badge>
                )}
                {market.marketFormat === "THE_CALL" && (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#8B5CF622", color: "#8B5CF6", border: "1px solid #8B5CF644" }}>🎯 The Call</Badge>
                )}
                {market.marketFormat === "MULTI_CHOICE" && (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#CFEA3B22", color: "#CFEA3B", border: "1px solid #CFEA3B44" }}>👑 Buzz Battle</Badge>
                )}
                {market.marketFormat === "HOT_OR_NOT" && (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#f9731622", color: "#f97316", border: "1px solid #f9731644" }}>🔥 Hot or Not</Badge>
                )}
                {market.marketFormat === "HEAD_TO_HEAD" && (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f644" }}>⚔️ Head to Head</Badge>
                )}
                {(!market.marketFormat || market.marketFormat === "STANDARD") && (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#6366f122", color: "#6366f1", border: "1px solid #6366f144" }}>📊 Forecast</Badge>
                )}
                {market.subcategory && <span className="text-muted-foreground text-sm font-medium">— {market.subcategory}</span>}
                {isResolved ? (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>✓ Resolved</Badge>
                ) : isClosed ? (
                  <Badge variant="outline" className="text-xs font-bold text-muted-foreground gap-1">🔒 Closed</Badge>
                ) : market.status === "SCHEDULED" ? (
                    <Badge className="gap-1 py-1 px-2.5 text-xs font-bold" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>
                      🗓 {(market as any).scheduledFor ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Coming Soon'}
                    </Badge>
) : (
                  <Badge className="gap-1 py-1 px-2.5 text-xs font-bold items-center" style={{ backgroundColor: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CopyLinkButton marketId={market.id} />
                {isResolved && market.resolvedOutcome && (
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                  >
                    <Share2 className="w-4 h-4" /> Share Result
                  </button>
                )}
                <button
                  onClick={handlePin}
                  title={isPinned ? "Unpin from profile" : "Pin to profile"}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all",
                    isPinned
                      ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                      : "bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                  )}
                >
                  {isPinned
                    ? <><BookmarkCheck className="w-4 h-4" /> Pinned</>
                    : <><Bookmark className="w-4 h-4" /> Pin</>
                  }
                </button>
              </div>
            </div>

            {isTheCall && (
              <p className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-2">🎯 The Call</p>
            )}
            {isBuzzOrBoo && (
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#CFEA3B" }}>⚡ BUZZ OR BOO</p>
            )}
            {isMultiChoice && (
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#CFEA3B" }}>👑 Buzz Battle</p>
            )}
            {market.marketFormat === "HOT_OR_NOT" && (
              <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-2">🔥 Hot or Not</p>
            )}
            {isHeadToHead && (
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2">⚔️ Head to Head</p>
            )}
            {isHeadToHead && h2hData && (
              <div className="mb-3">
                <div className="flex items-center gap-3 text-lg font-editorial font-bold">
                  <span style={{ color: "#3B82F6" }}>{h2hData.entityA}</span>
                  <span className="text-muted-foreground/40 font-light">vs</span>
                  <span style={{ color: "#8B5CF6" }}>{h2hData.entityB}</span>
                </div>
                {(h2hData.metric || h2hData.period) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {[h2hData.metric, h2hData.period].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            )}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-editorial font-bold leading-[1.1] text-balance mb-2">
              {market.question}
            </h1>
            {(market as any).whyNow && !isResolved && !isClosed && (
              <p className="text-sm font-semibold text-amber-500/90 mb-3">
                ⚡ WHY NOW — {(market as any).whyNow}
              </p>
            )}
            {/* Format instruction hint */}
            <p className="text-sm text-muted-foreground/70 italic mb-4">
              {isBuzzOrBoo ? "Give your verdict — ⚡ Buzz it up or 👎 Boo it down."
                : isTheCall ? "Pick the right answer — one pick, no take-backs."
                : isMultiChoice ? "Back one contender — the crowd picks the winner."
                : isHotOrNot ? "Declare it 🔥 HOT or ❄️ NOT HOT — simple as that."
                : isHeadToHead ? "Pick a side — who wins this head-to-head?"
                : "Forecast the outcome — will it happen or not?"}
            </p>

            {/* Total predictions headline — prefer live tally count when available; suppress for SCHEDULED */}
            {!isScheduled && (tallyLoading && market.totalPredictions === 0 ? (
              <div className="h-5 w-48 bg-muted/50 rounded-full animate-pulse mb-6" />
            ) : (() => {
              const displayCount = liveTotalCount > 0 ? liveTotalCount : market.totalPredictions;
              return displayCount > 0 ? (
                <div className="flex items-center gap-3 mb-6 text-muted-foreground text-sm flex-wrap">
                  <span className="flex items-center gap-2">
                    <span className="font-mono-numbers font-bold text-foreground">{formatNumber(displayCount)}</span>
                    <span>{isBuzzOrBoo
                      ? (displayCount === 1 ? "verdict cast" : "verdicts cast")
                      : isTheCall
                      ? (displayCount === 1 ? "pick made" : "picks made")
                      : isMultiChoice
                      ? (displayCount === 1 ? "vote cast" : "votes cast")
                      : isHotOrNot
                      ? (displayCount === 1 ? "verdict cast" : "verdicts cast")
                      : isHeadToHead
                      ? (displayCount === 1 ? "pick made" : "picks made")
                      : (displayCount === 1 ? "forecaster has weighed in" : "forecasters have weighed in")
                    }</span>
                    {market.status === 'OPEN' && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />}
                  </span>
                  {market.status === 'OPEN' && countdown.label && (
                    <CountdownBadge market={market} />
                  )}
                </div>
              ) : null;
            })())}
            {!isScheduled && !tallyLoading && (liveTotalCount === 0 && market.totalPredictions === 0) && market.status === 'OPEN' ? (
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <CountdownBadge market={market} />
                <span className="text-xs font-mono-numbers font-bold text-muted-foreground/60 border border-border/40 rounded-full px-2 py-0.5">0 {isBuzzOrBoo || isHotOrNot ? "verdicts" : isTheCall || isHeadToHead ? "picks" : isMultiChoice ? "votes" : "predictions"}</span>
                <span className="text-sm text-muted-foreground">
                  {isBuzzOrBoo ? "Be the first to cast a verdict"
                    : isHotOrNot ? "Be the first to cast a verdict"
                    : isTheCall ? "Be the first to make a pick"
                    : isMultiChoice ? "Be the first to back a contender"
                    : isHeadToHead ? `Be the first to pick — ${h2hData?.entityA ?? 'Side A'} or ${h2hData?.entityB ?? 'Side B'}`
                    : "Be the first to make a call"}
                </span>
              </div>
            ) : !isScheduled && !tallyLoading && (liveTotalCount === 0 && market.totalPredictions === 0) && isClosed && !isResolved ? (
              <div className="flex items-center gap-2 mb-6 text-muted-foreground/60 text-sm">
                <span>🔒</span>
                <span className="font-medium">
                  {market.closesAt
                    ? `Closed ${new Date(market.closesAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · Awaiting resolution`
                    : "Closed · Awaiting resolution"}
                </span>
              </div>
            ) : isScheduled ? (
              <div className="flex items-center gap-2 mb-6 text-amber-600 dark:text-amber-400 text-sm">
                <span>🗓</span>
                <span className="font-medium">
                  {(market as any).scheduledFor ? (() => {
                    const d = new Date((market as any).scheduledFor);
                    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
                    const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                    return `Opens ${dateStr} at ${timeStr}`;
                  })() : "Opening soon"}
                </span>
                {countdown.label && <span className="font-mono-numbers text-xs opacity-70">· {countdown.label}</span>}
              </div>
            ) : null}

            {/* Refresh nudge — shown when the market expired while the page was open */}
            {countdown.justExpired && !isClosed && (
              <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">
                  This market just closed —{" "}
                  <button
                    onClick={() => window.location.reload()}
                    className="underline underline-offset-2 hover:no-underline font-semibold"
                  >
                    refresh to see the final result
                  </button>
                </span>
              </div>
            )}

            {market.description && !isMultiChoice && !isBuzzOrBoo && !isTheCall && !isHeadToHead && !isHotOrNot && (
              <div className="mb-8 max-w-3xl">
                <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-2">About this market</p>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {market.description}
                </p>
              </div>
            )}

            {/* BUZZ-OR-BOO: Sentiment snapshot display */}
            {isBuzzOrBoo && (
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">⚡</span>
                  <h2 className="font-editorial text-2xl font-bold">Crowd Sentiment</h2>
                  {!isClosed && !isResolved && !isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                    </span>
                  )}
                  {isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>🗓 Opening Soon</span>
                  )}
                  {isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">🔒 Locked</span>
                  )}
                  {isClosed && !isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">🔒 Closed</span>
                  )}
                  {buzzTallyTotal > 0 && (
                    <span className="text-xs text-muted-foreground font-mono-numbers ml-1">{formatNumber(buzzTallyTotal)} {buzzTallyTotal === 1 ? 'verdict' : 'verdicts'}</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-8">
                  {isResolved ? "Final sentiment snapshot at close" : isClosed ? "Predictions are closed — awaiting final resolution" : isScheduled
                    ? (() => {
                        const sf = (market as any).scheduledFor;
                        if (!sf) return "Opens soon — check back to cast your verdict";
                        const d = new Date(sf);
                        return `Opens ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — check back to cast your verdict`;
                      })()
                    : "Live cultural verdict — tap to weigh in"}
                </p>
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
                  <div className={cn(
                    "flex-1 text-center p-4 rounded-2xl transition-all",
                    isResolved && market.resolvedOutcome === 'YES' ? "border-2 bg-opacity-10" : ""
                  )} style={isResolved && market.resolvedOutcome === 'YES' ? { borderColor: BUZZ_COLOR + '60', backgroundColor: BUZZ_COLOR + '10' } : {}}>
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2" style={{ color: BUZZ_COLOR }}>
                      {tallyLoading && !isResolved ? <span className="inline-block h-16 w-24 bg-muted/50 rounded-xl animate-pulse" /> : buzzTallyTotal === 0 ? <span className="text-5xl opacity-30">0%</span> : <>{liveBuzzPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ opacity: 0.6 }}>%</span></>}
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider" style={{ color: BUZZ_COLOR }}>
                      {isResolved && market.resolvedOutcome === 'YES' ? '⚡ BUZZ — WINNER' : isClosed && !isResolved ? '⚡ BUZZ AT CLOSE' : '⚡ BUZZ'}
                    </div>
                  </div>
                  <div className="hidden md:flex text-4xl text-muted-foreground/30 font-editorial font-light">vs</div>
                  <div className={cn(
                    "flex-1 text-center p-4 rounded-2xl transition-all",
                    isResolved && market.resolvedOutcome === 'NO' ? "border-2 bg-opacity-10" : ""
                  )} style={isResolved && market.resolvedOutcome === 'NO' ? { borderColor: BOO_COLOR + '60', backgroundColor: BOO_COLOR + '10' } : {}}>
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2" style={{ color: BOO_COLOR }}>
                      {tallyLoading && !isResolved ? <span className="inline-block h-16 w-24 bg-muted/50 rounded-xl animate-pulse" /> : buzzTallyTotal === 0 ? <span className="text-5xl opacity-30">0%</span> : <>{liveBooPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ opacity: 0.6 }}>%</span></>}
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider" style={{ color: BOO_COLOR }}>
                      {isResolved && market.resolvedOutcome === 'NO' ? '👎 BOO — WINNER' : isClosed && !isResolved ? '👎 BOO AT CLOSE' : '👎 BOO'}
                    </div>
                  </div>
                </div>
                {tallyLoading && !isResolved && (
                  <div className="h-5 w-full bg-muted/50 rounded-full overflow-hidden animate-pulse mb-2" />
                )}
                {isScheduled && buzzTallyTotal === 0 && (
                  <p className="text-sm text-amber-600/70 dark:text-amber-400/70 italic text-center py-2">
                    Verdicts open {(market as any).scheduledFor ? new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'when live'} — check back to weigh in
                  </p>
                )}
                {!tallyLoading && buzzTallyTotal === 0 && !isScheduled && !isResolved && (
                  <p className="text-sm text-muted-foreground italic text-center py-2">
                    {isClosed ? "No verdicts were recorded before close." : "No verdicts yet — be the first to weigh in!"}
                  </p>
                )}
                {!tallyLoading && buzzTallyTotal > 0 && (
                  <>
                    <div className="flex justify-between text-sm font-bold font-mono-numbers mb-1">
                      <span style={{ color: BUZZ_COLOR }}>⚡ {Math.round(liveBuzzPercent)}%</span>
                      <span style={{ color: BOO_COLOR }}>👎 {Math.round(liveBooPercent)}%</span>
                    </div>
                    <div className="h-5 w-full bg-secondary rounded-full overflow-hidden flex">
                      <div className="h-full transition-all duration-1000 ease-out rounded-l-full" style={{ width: `${liveBuzzPercent}%`, backgroundColor: BUZZ_COLOR }} />
                      <div className="h-full transition-all duration-1000 ease-out rounded-r-full" style={{ width: `${liveBooPercent}%`, backgroundColor: BOO_COLOR }} />
                    </div>
                    {!isClosed && !isResolved && (() => {
                      const margin = Math.abs(Math.round(liveBuzzPercent) - Math.round(liveBooPercent));
                      const leader = liveBuzzPercent > liveBooPercent ? '⚡ BUZZ' : liveBooPercent > liveBuzzPercent ? '👎 BOO' : null;
                      return leader ? (
                        <p className="text-[11px] text-center text-muted-foreground/60 mt-1">{leader} leads by {margin}pp</p>
                      ) : (
                        <p className="text-[11px] text-center text-muted-foreground/60 mt-1">⚖️ Dead even</p>
                      );
                    })()}
                    <div className="flex justify-between mt-2 text-sm font-mono-numbers text-muted-foreground">
                      <span>{formatNumber(buzzTallyYes)} BUZZ votes</span>
                      <span className="text-xs font-medium">{isClosed && !isResolved ? '🔒 at close' : `${formatNumber(buzzTallyTotal)} total`}</span>
                      <span>{formatNumber(buzzTallyNo)} BOO votes</span>
                    </div>
                  </>
                )}
                {isResolved && market.resolvedOutcome && (
                  <div className="mt-6 flex items-center justify-center gap-3 p-4 rounded-2xl border-2 animate-in fade-in zoom-in-95 duration-500" style={{
                    borderColor: market.resolvedOutcome === 'YES' ? BUZZ_COLOR + '80' : BOO_COLOR + '80',
                    backgroundColor: market.resolvedOutcome === 'YES' ? BUZZ_COLOR + '12' : BOO_COLOR + '12',
                  }}>
                    <span className="text-2xl">{market.resolvedOutcome === 'YES' ? '⚡' : '👎'}</span>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Final Verdict</div>
                      <div className="font-editorial font-bold text-xl" style={{ color: market.resolvedOutcome === 'YES' ? BUZZ_COLOR : BOO_COLOR }}>
                        {market.resolvedOutcome === 'YES' ? 'BUZZ won' : 'BOO won'}
                      </div>
                      {buzzTallyTotal > 0 && (() => {
                        const winnerCount = market.resolvedOutcome === 'YES' ? liveYesCount : liveNoCount;
                        return (
                          <div className="text-xs font-mono-numbers text-muted-foreground mt-0.5">
                            {Math.round(liveBuzzPercent)}% BUZZ · {Math.round(liveBooPercent)}% BOO
                            <span className="ml-2 text-muted-foreground/60">({formatNumber(winnerCount)} {winnerCount === 1 ? 'verdict' : 'verdicts'} for winner)</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HOT OR NOT: Crowd Verdict display */}
            {isHotOrNot && (
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🔥</span>
                  <h2 className="font-editorial text-2xl font-bold">Crowd Verdict</h2>
                  {!isClosed && !isResolved && !isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                    </span>
                  )}
                  {isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>🗓 Opening Soon</span>
                  )}
                  {isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      🔒 {market.resolvedOutcome === 'YES' ? '🔥 Hot won' : market.resolvedOutcome === 'NO' ? '❄️ Not Hot won' : 'Locked'}
                    </span>
                  )}
                  {isClosed && !isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">🔒 Closed</span>
                  )}
                  {liveTotalCount > 0 && (
                    <span className="text-xs text-muted-foreground font-mono-numbers ml-1">{formatNumber(liveTotalCount)} {liveTotalCount === 1 ? 'verdict' : 'verdicts'}</span>
                  )}
                </div>
                {market.description && !isScheduled && (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">About this call</p>
                    <p className="text-sm text-muted-foreground italic">{market.description}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mb-8">
                  {isResolved ? "Final verdict locked in" : isClosed ? "Verdicts are closed — awaiting final resolution" : isScheduled
                    ? (() => {
                        const sf = (market as any).scheduledFor;
                        if (!sf) return "Opens soon — check back to cast your verdict";
                        const d = new Date(sf);
                        return `Opens ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — check back to cast your verdict`;
                      })()
                    : "Live temperature check — is the city feeling it?"}
                </p>
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
                  <div className={cn(
                    "flex-1 text-center p-4 rounded-2xl transition-all",
                    isResolved && market.resolvedOutcome === 'YES' ? "border-2" : ""
                  )} style={isResolved && market.resolvedOutcome === 'YES' ? { borderColor: "#f9731660", backgroundColor: "#f9731610" } : {}}>
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2" style={{ color: "#f97316" }}>
                      {tallyLoading && !isResolved ? <span className="inline-block h-16 w-24 bg-muted/50 rounded-xl animate-pulse" /> : (liveTotalCount === 0) ? <span className="text-5xl opacity-30">0%</span> : <>{liveYesPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ opacity: 0.6 }}>%</span></>}
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider" style={{ color: "#f97316" }}>
                      {isResolved && market.resolvedOutcome === 'YES' ? '🔥 HOT — WINNER' : isClosed && !isResolved ? '🔥 HOT AT CLOSE' : '🔥 HOT'}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono-numbers mt-1">
                      {liveTotalCount > 0 ? `${formatNumber(liveYesCount)} votes` : !tallyLoading && !isResolved && !isScheduled ? '0 votes' : null}
                    </div>
                  </div>
                  <div className="hidden md:flex text-4xl text-muted-foreground/30 font-editorial font-light">vs</div>
                  <div className={cn(
                    "flex-1 text-center p-4 rounded-2xl transition-all",
                    isResolved && market.resolvedOutcome === 'NO' ? "border-2" : ""
                  )} style={isResolved && market.resolvedOutcome === 'NO' ? { borderColor: "#6b728060", backgroundColor: "#6b728010" } : {}}>
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2" style={{ color: "#6b7280" }}>
                      {tallyLoading && !isResolved ? <span className="inline-block h-16 w-24 bg-muted/50 rounded-xl animate-pulse" /> : (liveTotalCount === 0) ? <span className="text-5xl opacity-30">0%</span> : <>{liveNoPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ opacity: 0.6 }}>%</span></>}
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider" style={{ color: "#6b7280" }}>
                      {isResolved && market.resolvedOutcome === 'NO' ? '❄️ NOT HOT — WINNER' : isClosed && !isResolved ? '❄️ NOT HOT AT CLOSE' : '❄️ NOT HOT'}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono-numbers mt-1">
                      {liveTotalCount > 0 ? `${formatNumber(liveNoCount)} votes` : !tallyLoading && !isResolved && !isScheduled ? '0 votes' : null}
                    </div>
                  </div>
                </div>
                {tallyLoading && !isResolved && (
                  <div className="h-5 w-full bg-muted/50 rounded-full overflow-hidden animate-pulse mb-2" />
                )}
                {isScheduled && liveTotalCount === 0 && (
                  <p className="text-sm text-amber-600/70 dark:text-amber-400/70 italic text-center py-2">
                    Verdicts open {(market as any).scheduledFor ? new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'when live'} — check back to weigh in
                  </p>
                )}
                {!tallyLoading && liveTotalCount === 0 && !isScheduled && !isResolved && (
                  <p className="text-sm text-muted-foreground italic text-center py-2">
                    {isClosed ? "No verdicts were recorded before close." : "No verdicts yet — be the first to weigh in!"}
                  </p>
                )}
                {!tallyLoading && !(liveTotalCount === 0) && !(isScheduled && liveTotalCount === 0) && (
                  <>
                    <div className="flex justify-between text-sm font-mono-numbers font-bold mb-2">
                      <span style={{ color: "#f97316" }}>🔥 {Math.round(liveYesPercent)}%</span>
                      <span style={{ color: "#6b7280" }}>❄️ {Math.round(liveNoPercent)}%</span>
                    </div>
                    <div className="h-5 w-full bg-secondary rounded-full overflow-hidden flex">
                      <div className="h-full transition-all duration-1000 ease-out rounded-l-full" style={{ width: `${liveYesPercent}%`, backgroundColor: "#f97316" }} />
                      <div className="h-full transition-all duration-1000 ease-out rounded-r-full" style={{ width: `${liveNoPercent}%`, backgroundColor: "#6b7280" }} />
                    </div>
                    {!isClosed && !isResolved && (() => {
                      const margin = Math.abs(Math.round(liveYesPercent) - Math.round(liveNoPercent));
                      const leader = liveYesPercent > liveNoPercent ? '🔥 HOT' : liveNoPercent > liveYesPercent ? '❄️ NOT HOT' : null;
                      return leader ? (
                        <p className="text-[11px] text-center text-muted-foreground/60 mt-1">{leader} leads by {margin}pp</p>
                      ) : (
                        <p className="text-[11px] text-center text-muted-foreground/60 mt-1">⚖️ Dead even</p>
                      );
                    })()}
                    <div className="flex justify-between mt-2 text-sm font-mono-numbers text-muted-foreground">
                      <span>{formatNumber(liveYesCount)} 🔥 Hot</span>
                      <span className="text-xs font-medium">{isClosed && !isResolved ? '🔒 at close' : `${formatNumber(liveTotalCount)} total verdicts`}</span>
                      <span>{formatNumber(liveNoCount)} ❄️ Not Hot</span>
                    </div>
                  </>
                )}
                {isResolved && market.resolvedOutcome && (
                  <div className="mt-6 flex items-center justify-between gap-3 p-4 rounded-2xl border-2 animate-in fade-in zoom-in-95 duration-500" style={{
                    borderColor: market.resolvedOutcome === 'YES' ? "#f9731680" : "#6b728080",
                    backgroundColor: market.resolvedOutcome === 'YES' ? "#f9731612" : "#6b728012",
                  }}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{market.resolvedOutcome === 'YES' ? '🔥' : '❄️'}</span>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Final Verdict</div>
                        <div className="font-editorial font-bold text-xl" style={{ color: market.resolvedOutcome === 'YES' ? "#f97316" : "#6b7280" }}>
                          {market.resolvedOutcome === 'YES' ? 'Hot' : 'Not Hot'}
                        </div>
                      </div>
                    </div>
                    {liveTotalCount > 0 && (() => {
                      const winnerPct = market.resolvedOutcome === 'YES' ? liveYesPercent : liveNoPercent;
                      const winnerCount = market.resolvedOutcome === 'YES' ? liveYesCount : liveNoCount;
                      return (
                        <div className="text-right">
                          <div className="font-mono-numbers font-bold text-lg" style={{ color: market.resolvedOutcome === 'YES' ? "#f97316" : "#6b7280" }}>
                            {winnerPct.toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">{formatNumber(winnerCount)} {winnerCount === 1 ? 'verdict' : 'verdicts'}</div>
                          <div className="text-[10px] text-muted-foreground/60">{formatNumber(liveTotalCount)} total</div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* HEAD TO HEAD: Matchup display */}
            {isHeadToHead && (
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🏆</span>
                  <h2 className="font-editorial text-2xl font-bold">Who Does the Crowd Back?</h2>
                  {!isClosed && !isResolved && !isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                    </span>
                  )}
                  {isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>🗓 Opening Soon</span>
                  )}
                  {isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">🔒 Locked</span>
                  )}
                  {isClosed && !isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">🔒 Closed</span>
                  )}
                  {liveTotalCount > 0 && (
                    <span className="text-xs text-muted-foreground font-mono-numbers ml-1">{formatNumber(liveTotalCount)} {liveTotalCount === 1 ? 'pick' : 'picks'}</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-8">
                  {isResolved ? "Final matchup result locked in" : isClosed ? "Predictions are closed — awaiting final resolution" : isScheduled
                    ? (() => {
                        const sf = (market as any).scheduledFor;
                        if (!sf) return "Opens soon — picks will appear when the market goes live";
                        const d = new Date(sf);
                        return `Opens ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — picks will appear when the market goes live`;
                      })()
                    : h2hData?.metric ? `Metric: ${h2hData.metric}${h2hData.period ? ` · ${h2hData.period}` : ""}` : "Two sides. Pick your winner."}
                </p>
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
                  <div className={cn(
                    "flex-1 text-center p-4 rounded-2xl transition-all",
                    isResolved && market.resolvedOutcome === 'YES' ? "border-2" : ""
                  )} style={isResolved && market.resolvedOutcome === 'YES' ? { borderColor: "#3B82F660", backgroundColor: "#3B82F610" } : {}}>
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2" style={{ color: "#3B82F6" }}>
                      {tallyLoading && !isResolved ? <span className="inline-block h-16 w-24 bg-muted/50 rounded-xl animate-pulse" /> : (liveTotalCount === 0) ? <span className="text-5xl opacity-30">0%</span> : <>{liveYesPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ opacity: 0.6 }}>%</span></>}
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider" style={{ color: "#3B82F6" }}>
                      {isResolved && market.resolvedOutcome === 'YES' ? `🏆 ${h2hData?.entityA ?? 'Side A'}` : (h2hData?.entityA ?? 'Side A')}
                    </div>
                  </div>
                  <div className="hidden md:flex text-4xl text-muted-foreground/30 font-editorial font-light">vs</div>
                  <div className={cn(
                    "flex-1 text-center p-4 rounded-2xl transition-all",
                    isResolved && market.resolvedOutcome === 'NO' ? "border-2" : ""
                  )} style={isResolved && market.resolvedOutcome === 'NO' ? { borderColor: "#8B5CF660", backgroundColor: "#8B5CF610" } : {}}>
                    <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2" style={{ color: "#8B5CF6" }}>
                      {tallyLoading && !isResolved ? <span className="inline-block h-16 w-24 bg-muted/50 rounded-xl animate-pulse" /> : (liveTotalCount === 0) ? <span className="text-5xl opacity-30">0%</span> : <>{liveNoPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ opacity: 0.6 }}>%</span></>}
                    </div>
                    <div className="font-mono-numbers text-sm font-bold tracking-wider" style={{ color: "#8B5CF6" }}>
                      {isResolved && market.resolvedOutcome === 'NO' ? `🏆 ${h2hData?.entityB ?? 'Side B'}` : (h2hData?.entityB ?? 'Side B')}
                    </div>
                  </div>
                </div>
                {tallyLoading && !isResolved && (
                  <div className="h-5 w-full bg-muted/50 rounded-full overflow-hidden animate-pulse mt-2 mb-4" />
                )}
                {!tallyLoading && liveTotalCount === 0 && !isScheduled && !isResolved && (
                  <p className="text-sm text-center text-muted-foreground/70 italic mt-2 mb-4">
                    {isClosed ? "No picks were recorded before close." : "No picks yet — be the first to call it"}
                  </p>
                )}
                {isScheduled && (
                  <p className="text-sm text-center text-amber-600/70 dark:text-amber-400/70 italic mt-2 mb-4">
                    Picks will appear here when the market opens
                  </p>
                )}
                {!tallyLoading && liveTotalCount > 0 && (() => {
                  const entityALeads = liveYesPercent > liveNoPercent;
                  const entityBLeads = liveNoPercent > liveYesPercent;
                  return (
                    <>
                      {!isResolved && liveTotalCount > 0 && (
                        <div className="mb-2 text-xs font-bold text-muted-foreground tracking-wider uppercase text-center animate-in fade-in duration-500">
                          {isClosed
                            ? (entityALeads || entityBLeads
                                ? `⚔️ Ahead at close: ${entityALeads ? (h2hData?.entityA ?? 'Side A') : (h2hData?.entityB ?? 'Side B')}`
                                : '⚖️ Split at close — too close to call')
                            : (entityALeads || entityBLeads
                                ? `⚔️ Crowd backs ${entityALeads ? (h2hData?.entityA ?? 'Side A') : (h2hData?.entityB ?? 'Side B')} +${Math.abs(Math.round(liveYesPercent) - Math.round(liveNoPercent))}pp`
                                : '⚖️ Crowd is split — too close to call')}
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-mono-numbers font-bold mb-2">
                        <span style={{ color: "#3B82F6" }}>{Math.round(liveYesPercent)}%</span>
                        <span style={{ color: "#8B5CF6" }}>{Math.round(liveNoPercent)}%</span>
                      </div>
                      <div className="h-5 w-full bg-secondary rounded-full overflow-hidden flex">
                        <div className="h-full transition-all duration-1000 ease-out rounded-l-full" style={{ width: `${liveYesPercent}%`, backgroundColor: "#3B82F6" }} />
                        <div className="h-full transition-all duration-1000 ease-out rounded-r-full" style={{ width: `${liveNoPercent}%`, backgroundColor: "#8B5CF6" }} />
                      </div>
                      <div className="flex justify-between mt-3 text-sm font-mono-numbers text-muted-foreground">
                        <span>{formatNumber(liveYesCount)} backing {h2hData?.entityA ?? 'Side A'}</span>
                        <span className="text-xs font-medium">{isClosed && !isResolved ? '🔒 at close' : `${formatNumber(liveTotalCount)} total picks`}</span>
                        <span>{formatNumber(liveNoCount)} backing {h2hData?.entityB ?? 'Side B'}</span>
                      </div>
                    </>
                  );
                })()}
                {isResolved && market.resolvedOutcome && (
                  <div className="mt-6 flex items-center justify-between gap-3 p-4 rounded-2xl border-2 animate-in fade-in zoom-in-95 duration-500" style={{
                    borderColor: market.resolvedOutcome === 'YES' ? "#3B82F680" : "#8B5CF680",
                    backgroundColor: market.resolvedOutcome === 'YES' ? "#3B82F612" : "#8B5CF612",
                  }}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚔️</span>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Winner</div>
                        <div className="font-editorial font-bold text-xl" style={{ color: market.resolvedOutcome === 'YES' ? "#3B82F6" : "#8B5CF6" }}>
                          {market.resolvedOutcome === 'YES' ? (h2hData?.entityA ?? 'Side A') : (h2hData?.entityB ?? 'Side B')}
                        </div>
                      </div>
                    </div>
                    {liveTotalCount > 0 ? (() => {
                      const winnerPct = market.resolvedOutcome === 'YES' ? liveYesPercent : liveNoPercent;
                      const winnerCount = market.resolvedOutcome === 'YES' ? liveYesCount : liveNoCount;
                      const loserPct = market.resolvedOutcome === 'YES' ? liveNoPercent : liveYesPercent;
                      const loserCount = market.resolvedOutcome === 'YES' ? liveNoCount : liveYesCount;
                      const loserEntity = market.resolvedOutcome === 'YES' ? (h2hData?.entityB ?? 'Side B') : (h2hData?.entityA ?? 'Side A');
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <div className="font-mono-numbers font-bold text-lg" style={{ color: market.resolvedOutcome === 'YES' ? "#3B82F6" : "#8B5CF6" }}>
                            {winnerPct.toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">{formatNumber(winnerCount)} {winnerCount === 1 ? 'pick' : 'picks'} · {formatNumber(liveTotalCount)} total</div>
                          <div className="text-[10px] text-muted-foreground/50">{loserEntity}: {loserPct.toFixed(0)}% · {formatNumber(loserCount)} {loserCount === 1 ? 'pick' : 'picks'}</div>
                        </div>
                      );
                    })() : (
                      <div className="text-right text-[11px] text-muted-foreground italic">No picks were cast</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* THE CALL: Crowd Intelligence display */}
            {isTheCall && theCallData && (
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🎯</span>
                  <h2 className="font-editorial text-2xl font-bold">The Call</h2>
                  {!isClosed && !isResolved && !isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                    </span>
                  )}
                  {isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>🗓 Opening Soon</span>
                  )}
                  {isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">🔒 Locked</span>
                  )}
                  {isClosed && !isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">🔒 Closed</span>
                  )}
                  {totalTheCallVotes > 0 && (
                    <span className="text-xs text-muted-foreground font-mono-numbers ml-1">{formatNumber(totalTheCallVotes)} {totalTheCallVotes === 1 ? 'pick' : 'picks'}</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-8">
                  {isResolved ? "The crowd has spoken — see who they backed." : isClosed ? "Picks are closed — awaiting final resolution" : isScheduled
                    ? (() => {
                        const sf = (market as any).scheduledFor;
                        if (!sf) return "Opens soon — picks will appear when the market goes live";
                        const d = new Date(sf);
                        return `Opens ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — picks will appear when the market goes live`;
                      })()
                    : "Crowd intelligence — pick the best answer"}
                </p>

                {theCallData.context && (
                  <div className="mb-6 px-4 py-3 rounded-xl border border-border/50 bg-muted/30">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Context</p>
                    <p className="text-sm text-muted-foreground italic">{theCallData.context}</p>
                  </div>
                )}

                {isResolved && market.resolvedOutcome && (() => {
                  const winnerOption = theCallData.options.find(o => o.key === market.resolvedOutcome);
                  const winnerCount = theCallCounts[market.resolvedOutcome] ?? 0;
                  const winnerPct = totalTheCallVotes > 0 ? Math.round((winnerCount / totalTheCallVotes) * 100) : null;
                  return winnerOption ? (
                    <div className="mb-6 px-4 py-4 rounded-2xl border-2 border-primary/50 bg-primary/8 animate-in fade-in zoom-in-95 duration-500">
                      <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">✓ Resolved winner</p>
                      <p className="font-editorial text-2xl font-bold text-primary">{winnerOption.label}</p>
                      {winnerPct != null && (
                        <p className="text-xs text-muted-foreground font-mono-numbers mt-1">
                          {winnerPct}% of picks · {formatNumber(winnerCount)} {winnerCount === 1 ? 'pick' : 'picks'}
                        </p>
                      )}
                    </div>
                  ) : null;
                })()}
                {!isResolved && totalTheCallVotes > 0 && (() => {
                  const sortedCounts = Object.entries(theCallCounts).sort((a, b) => b[1] - a[1]);
                  const topCount = sortedCounts[0]?.[1] ?? 0;
                  const tiedKeys = sortedCounts.filter(([, c]) => c === topCount).map(([k]) => k);
                  const isTied = tiedKeys.length > 1;
                  const leadingKey = sortedCounts[0]?.[0];
                  const leadingOption = theCallData.options.find(o => o.key === leadingKey);
                  const leadingPct = leadingKey && !isTied ? Math.round(((theCallCounts[leadingKey] ?? 0) / totalTheCallVotes) * 100) : null;
                  return leadingOption ? (
                    <div className="mb-6 px-4 py-3 rounded-2xl border border-primary/30 bg-primary/5">
                      <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
                        {isClosed ? 'Ahead at close' : (isTied ? "Too close to call…" : "The crowd says…")}
                      </p>
                      <div className="flex items-baseline gap-2">
                        <p className="font-editorial text-2xl font-bold text-primary">
                          {isTied ? "It's a tie!" : leadingOption.label}
                        </p>
                        {leadingPct != null && !isTied && (
                          <span className="text-sm font-mono-numbers font-bold text-primary/70">{leadingPct}%</span>
                        )}
                        {isTied && (
                          <span className="text-sm font-mono-numbers font-bold text-primary/70">
                            {tiedKeys.slice(0, 3).map(k => theCallData.options.find(o => o.key === k)?.label ?? k).join(" · ")}
                          </span>
                        )}
                      </div>
                      {!isTied && sortedCounts[1] && (() => { const ru = theCallData.options.find(o => o.key === sortedCounts[1][0]); const ruPct = Math.round((sortedCounts[1][1] / totalTheCallVotes) * 100); return ru ? <p className="text-[11px] text-muted-foreground/60 mt-0.5">Runner-up: {ru.label} · {ruPct}%</p> : null; })()}
                      <p className="text-xs text-muted-foreground font-mono-numbers mt-1">{formatNumber(totalTheCallVotes)} {totalTheCallVotes === 1 ? 'pick' : 'picks'} {isClosed ? 'recorded' : 'so far'}</p>
                    </div>
                  ) : null;
                })()}

                {totalTheCallVotes === 0 && !isResolved && !isScheduled && (
                  <p className="text-sm text-muted-foreground italic text-center pb-2">
                    {isClosed
                      ? "No picks were recorded before close."
                      : "No picks yet — be the first to make your call."}
                  </p>
                )}
                <div className="space-y-4">
                  {theCallData.options.map((o, i) => {
                    const count = theCallCounts[o.key] ?? 0;
                    const pct = totalTheCallVotes > 0
                      ? Math.round((count / totalTheCallVotes) * 100)
                      : 0;
                    const color = THE_CALL_COLORS[i % THE_CALL_COLORS.length];
                    const isLeading = totalTheCallVotes > 0 &&
                      count === Math.max(...Object.values(theCallCounts));
                    const isWinner = isResolved && market.resolvedOutcome === o.key;

                    return (
                      <div key={o.key} className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${isWinner ? "bg-primary/15 border-2 border-primary/60" : isLeading ? "bg-primary/10 border border-primary/30" : "bg-muted/30"}`}>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={cn("font-editorial font-bold text-lg", isWinner && "text-primary")}>{o.label}</span>
                              {isWinner && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
                                  {isResolved ? "🏆 Crowd Picked" : "✓ Winner"}
                                </span>
                              )}
                              {!isResolved && !isClosed && isLeading && !isWinner && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded font-sans">Leading</span>
                              )}
                              {isClosed && !isResolved && isLeading && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-sans">Ahead at close</span>
                              )}
                            </div>
                            <span className={cn(isWinner ? "text-primary" : "", "font-mono-numbers font-bold text-sm")} style={{ color: isWinner ? undefined : color }}>
                              {totalTheCallVotes > 0 ? `${pct}%` : '—'}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: totalTheCallVotes > 0 ? `${pct}%` : '0%', backgroundColor: isWinner ? 'hsl(var(--primary))' : color }} />
                          </div>
                          {!isScheduled && (
                            <div className="text-[11px] text-muted-foreground mt-1">{count} {count === 1 ? 'pick' : 'picks'}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(!isScheduled || totalTheCallVotes > 0) && (
                <div className="flex justify-between mt-6 text-sm font-mono-numbers text-muted-foreground">
                  <span>{formatNumber(totalTheCallVotes)} {isClosed && !isResolved ? (totalTheCallVotes === 1 ? 'pick at close' : 'picks at close') : (totalTheCallVotes === 1 ? 'total pick' : 'total picks')}</span>
                  {isResolved && <span className="inline-flex items-center gap-1 text-muted-foreground"><span>🔒</span> Snapshot locked</span>}
                  {isClosed && !isResolved && <span className="inline-flex items-center gap-1 text-muted-foreground/60 text-[10px]"><span>🔒</span> Awaiting resolution</span>}
                </div>
                )}
              </div>
            )}

            {/* MULTI-CHOICE: Contender leaderboard */}
            {isMultiChoice && !multiChoiceData && (
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8 animate-pulse">
                <div className="h-7 w-32 bg-muted rounded mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded-xl" />)}
                </div>
              </div>
            )}
            {isMultiChoice && multiChoiceData ? (
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-5 h-5 text-primary" />
                  <h2 className="font-editorial text-2xl font-bold">Buzz Battle</h2>
                  <span className="text-xs text-muted-foreground font-mono-numbers">{multiChoiceData.contenders.length} contenders{totalContenderVotes > 0 ? ` · ${formatNumber(totalContenderVotes)} ${totalContenderVotes === 1 ? 'vote' : 'votes'}` : ''}</span>
                  {!isClosed && !isResolved && !isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                    </span>
                  )}
                  {isScheduled && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>🗓 Opening Soon</span>
                  )}
                  {isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">🔒 Locked</span>
                  )}
                  {isClosed && !isResolved && (
                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">🔒 Closed</span>
                  )}
                </div>
                {isScheduled && (() => {
                  const sf = (market as any).scheduledFor;
                  if (!sf) return null;
                  const d = new Date(sf);
                  return (
                    <p className="text-sm text-muted-foreground mb-4">
                      Opens {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — check back to vote
                    </p>
                  );
                })()}
                {isClosed && !isResolved && (
                  <p className="text-sm text-muted-foreground mb-4">Predictions are closed — awaiting final resolution</p>
                )}
                {multiChoiceData.metric && (
                  <p className="text-muted-foreground text-sm mb-4">{multiChoiceData.metric} · {multiChoiceData.period}</p>
                )}
                {(multiChoiceData as any).context && (
                  <div className="mb-6 px-4 py-3 rounded-xl border border-border/50 bg-muted/30">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Context</p>
                    <p className="text-sm text-muted-foreground italic">{(multiChoiceData as any).context}</p>
                  </div>
                )}
                {isResolved && market.resolvedOutcome && (() => {
                  const winnerContender = multiChoiceData.contenders.find(c => c.key === market.resolvedOutcome);
                  const winnerVotes = contenderCounts[market.resolvedOutcome] ?? 0;
                  const winnerPct = totalContenderVotes > 0 ? Math.round((winnerVotes / totalContenderVotes) * 100) : null;
                  return winnerContender ? (
                    <div className="mb-6 px-4 py-4 rounded-2xl border-2 border-primary/50 bg-primary/8 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-500">
                      <span className="text-2xl">🏆</span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Winner</p>
                        <p className="font-editorial font-bold text-xl text-primary">{winnerContender.name}</p>
                        {winnerContender.venue && <p className="text-xs text-muted-foreground mt-0.5">{winnerContender.venue}</p>}
                        {winnerPct != null && (
                          <p className="text-xs text-muted-foreground font-mono-numbers mt-1">
                            {winnerPct}% of votes · {formatNumber(winnerVotes)} {winnerVotes === 1 ? 'vote' : 'votes'}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}

                {totalContenderVotes > 0 && !isResolved && (() => {
                  const allCounts = multiChoiceData.contenders.map(c => contenderCounts[c.key] ?? 0);
                  const maxCount = Math.max(...allCounts);
                  const leaders = multiChoiceData.contenders.filter(c => (contenderCounts[c.key] ?? 0) === maxCount && maxCount > 0);
                  const isTie = leaders.length > 1;
                  const leader = leaders[0];
                  const leaderPct = leader ? Math.round(((contenderCounts[leader.key] ?? 0) / totalContenderVotes) * 100) : 0;
                  return (
                    <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/40 border border-border/50">
                      <span className="text-xl">{isTie ? '⚖️' : '👑'}</span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
                          {isClosed ? 'Ahead at close' : 'The crowd backs'}
                        </p>
                        <p className="font-editorial font-bold text-base text-foreground">
                          {isTie ? `Tied at ${leaderPct}% — ${leaders.length > 2 ? leaders.slice(0, 2).map(l => l.name).join(', ') + ' +' + (leaders.length - 2) + ' more' : leaders.map(l => l.name).join(' vs ')}` : `${leader.name} · ${leaderPct}%`}
                        </p>
                        {!isTie && (() => { const ru = multiChoiceData.contenders.find(c => !leaders.some((l: any) => l.key === c.key) && (contenderCounts[c.key] ?? 0) > 0); const ruPct = ru ? Math.round(((contenderCounts[ru.key] ?? 0) / totalContenderVotes) * 100) : null; return ru && ruPct ? <p className="text-[11px] text-muted-foreground/60 mt-0.5">Runner-up: {ru.name} · {ruPct}%</p> : null; })()}
                      </div>
                    </div>
                  );
                })()}
                {totalContenderVotes === 0 && !isResolved && !isScheduled && (
                  <p className="text-sm text-muted-foreground italic text-center pb-2">
                    {isClosed
                      ? "No predictions were recorded before close."
                      : "No predictions yet — be the first to back a contender."}
                  </p>
                )}
                <div className="space-y-4">
                  {(() => {
                    // Sort contenders: winner first when resolved; otherwise by vote count desc (ties keep source order)
                    const sorted = [...multiChoiceData.contenders].sort((a, b) => {
                      if (isResolved) {
                        const aWin = market.resolvedOutcome === a.key ? -1 : 0;
                        const bWin = market.resolvedOutcome === b.key ? 1 : 0;
                        return aWin + bWin;
                      }
                      return (contenderCounts[b.key] ?? 0) - (contenderCounts[a.key] ?? 0);
                    });
                    const allCounts = sorted.map(c => contenderCounts[c.key] ?? 0);
                    const maxCount = allCounts.length > 0 ? Math.max(...allCounts) : 0;
                    // Use source index for consistent color assignment
                    const srcIndex = (key: string) => multiChoiceData.contenders.findIndex(c => c.key === key);
                    return sorted.map((c) => {
                      const i = srcIndex(c.key);
                      const count = contenderCounts[c.key] ?? 0;
                      const pct = totalContenderVotes > 0 ? Math.round((count / totalContenderVotes) * 100) : 0;
                      const color = CONTENDER_COLORS[i % CONTENDER_COLORS.length];
                      const isWinner = isResolved && market.resolvedOutcome === c.key;
                      const isLeading = !isResolved && totalContenderVotes > 0 && count === maxCount && count > 0;

                      return (
                        <div key={c.key} className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl transition-all",
                          isWinner ? "bg-primary/10 border border-primary/30" : isLeading ? "bg-muted/50 border border-border/80" : "bg-muted/30"
                        )}>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-editorial font-bold text-lg flex items-center gap-2">
                                {isWinner && <Crown className="w-4 h-4 text-primary" />}
                                {c.name}
                                {c.venue && <span className="text-xs font-normal text-muted-foreground font-sans">{c.venue}</span>}
                                {isWinner && <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/15 px-1.5 py-0.5 rounded font-sans">WINNER</span>}
                                {isLeading && !isWinner && !isClosed && <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded font-sans">Leading</span>}
                                {isLeading && !isWinner && isClosed && <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-sans">Ahead at close</span>}
                              </span>
                              <span className="font-mono-numbers font-bold text-sm" style={{ color }}>
                                {totalContenderVotes > 0 ? `${pct}%` : '—'}
                              </span>
                            </div>
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-1000"
                                style={{ width: totalContenderVotes > 0 ? `${pct}%` : '0%', backgroundColor: color }}
                              />
                            </div>
                            {!isScheduled && (
                              <div className="text-[11px] text-muted-foreground mt-1">{count.toLocaleString()} {count === 1 ? 'prediction' : 'predictions'}</div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <div className="mt-4 pt-3 border-t border-border/40 text-center">
                    {totalContenderVotes > 0 ? (
                      <span className="text-sm text-muted-foreground">
                        <span className="font-mono-numbers font-bold text-foreground">{totalContenderVotes.toLocaleString()}</span> {isClosed && !isResolved ? 'votes at close' : 'total votes'}
                      </span>
                    ) : isResolved ? (
                      <span className="text-sm text-muted-foreground italic">No votes were recorded</span>
                    ) : isScheduled ? (
                      <span className="text-sm text-muted-foreground">Voting opens {(market as any).scheduledFor ? new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'soon'}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">0 total votes — be the first to vote</span>
                    )}
                    {isResolved && (
                      <span className="ml-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">🔒 Snapshot locked</span>
                    )}
                    {isClosed && !isResolved && (
                      <span className="ml-2 text-[10px] text-muted-foreground/60">🔒 Awaiting resolution</span>
                    )}
                  </div>
                </div>
              </div>
            ) : !isTheCall && !isHotOrNot && !isHeadToHead && !isBuzzOrBoo && !isMultiChoice && !isScheduled ? (
              /* STANDARD: Giant Probability Display */
              <div className="bg-card border border-border shadow-sm rounded-3xl p-6 md:p-10 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <h2 className="font-editorial text-xl font-bold">Crowd Forecast</h2>
                    {liveTotalCount > 0 && (
                      <span className="text-xs text-muted-foreground font-mono-numbers">{formatNumber(liveTotalCount)} {liveTotalCount === 1 ? 'prediction' : 'predictions'}</span>
                    )}
                  </div>
                  {isResolved ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      🔒 Locked
                    </span>
                  ) : isClosed ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      🔒 Closed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-green-500">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                {isResolved && market.resolvedOutcome && (() => {
                  // For formats using non-YES/NO keys (MULTI_CHOICE, THE_CALL), use a neutral primary colour instead of the NO-red
                  const usesCustomKey = (isMultiChoice || isTheCall) && market.resolvedOutcome !== 'YES' && market.resolvedOutcome !== 'NO';
                  const bannerColor = usesCustomKey ? '#8B5CF6' : market.resolvedOutcome === 'YES' ? colors.yes : colors.no;
                  return (
                  <div className="mb-6 flex items-center gap-3 p-4 rounded-2xl border-2 animate-in fade-in zoom-in-95 duration-500" style={{
                    borderColor: `${bannerColor}80`,
                    backgroundColor: `${bannerColor}12`,
                  }}>
                    <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: bannerColor }} />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Final Outcome</div>
                      <div className="font-editorial font-bold text-xl" style={{ color: bannerColor }}>
                        {isBuzzOrBoo
                          ? (market.resolvedOutcome === 'YES' ? '⚡ BUZZ — Winner' : '👎 BOO — Winner')
                          : isHotOrNot
                          ? (market.resolvedOutcome === 'YES' ? '🔥 Hot — Confirmed' : '❄️ Not Hot — Confirmed')
                          : isHeadToHead
                          ? (market.resolvedOutcome === 'YES' ? `⚔️ ${h2hData?.entityA ?? 'Side A'} — Winner` : `⚔️ ${h2hData?.entityB ?? 'Side B'} — Winner`)
                          : isMultiChoice
                          ? `🏆 ${multiChoiceData?.contenders.find(c => c.key === market.resolvedOutcome)?.name ?? market.resolvedOutcome} — Winner`
                          : isTheCall
                          ? `🎯 ${theCallData?.options.find(o => o.key === market.resolvedOutcome)?.label ?? market.resolvedOutcome} — Confirmed`
                          : (market.resolvedOutcome === 'YES' ? '✅ YES — Confirmed' : '❌ NO — Confirmed')}
                      </div>
                    </div>
                  </div>
                  );
                })()}
                {tallyLoading && !isResolved && (
                  <div className="h-5 w-full bg-muted/50 rounded-full overflow-hidden animate-pulse mb-6" />
                )}
                {!tallyLoading && liveTotalCount === 0 && !isResolved && (
                  <div className="text-center py-8">
                    {isClosed ? (
                      <>
                        <p className="text-muted-foreground text-sm mb-1">No predictions were recorded before close.</p>
                        <p className="text-muted-foreground/60 text-xs">Awaiting final resolution.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground text-sm mb-1">No predictions yet</p>
                        <p className="text-muted-foreground/60 text-xs">Be the first to make your call!</p>
                      </>
                    )}
                  </div>
                )}
                {!tallyLoading && liveTotalCount > 0 && (() => {
                  const crowdLeadsYes = liveYesPercent > liveNoPercent;
                  const crowdLeadsNo = liveNoPercent > liveYesPercent;
                  const leadLabel = isBuzzOrBoo
                    ? (crowdLeadsYes ? '⚡ Crowd leans BUZZ' : crowdLeadsNo ? '👎 Crowd leans BOO' : '⚖️ Crowd is split')
                    : isHotOrNot
                    ? (crowdLeadsYes ? '🔥 Crowd leans HOT' : crowdLeadsNo ? '❄️ Crowd leans NOT HOT' : '⚖️ Crowd is split')
                    : (crowdLeadsYes ? '📈 Crowd leans YES' : crowdLeadsNo ? '📉 Crowd leans NO' : '⚖️ Crowd is split');
                  return (
                    <>
                      {!isResolved && leadLabel && (
                        <div className="mb-4 text-xs font-bold text-muted-foreground tracking-wider uppercase text-center animate-in fade-in duration-500">
                          {isClosed ? leadLabel.replace('Crowd leans', 'At close —') : leadLabel}
                        </div>
                      )}
                      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
                        <div className={cn("flex-1 text-center md:text-left p-4 rounded-2xl transition-all", isResolved && market.resolvedOutcome === 'YES' ? "bg-primary/8 border border-primary/30" : (!isResolved && !isClosed && crowdLeadsYes ? "bg-primary/5 border border-primary/20" : ""))}>
                          <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2 flex items-baseline justify-center md:justify-start" style={{ color: colors.yes, opacity: isClosed && !isResolved ? 0.75 : 1 }}>
                            {liveYesPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ color: colors.yes, opacity: 0.6 }}>%</span>
                          </div>
                          <div className="font-mono-numbers text-sm font-bold tracking-wider text-muted-foreground">
                            {isBuzzOrBoo ? 'BUZZ' : isHotOrNot ? 'HOT' : 'YES'} {isResolved ? 'FINAL SHARE' : isClosed && !isResolved ? 'AT CLOSE' : 'PROBABILITY'}
                            {!isResolved && !isClosed && crowdLeadsYes && <span className="ml-1.5 text-primary">↑</span>}
                          </div>
                        </div>
                        <div className="hidden md:flex text-4xl text-muted-foreground/30 font-editorial font-light">vs</div>
                        <div className={cn("flex-1 text-center md:text-right p-4 rounded-2xl transition-all", isResolved && market.resolvedOutcome === 'NO' ? "bg-destructive/8 border border-destructive/30" : (!isResolved && !isClosed && crowdLeadsNo ? "bg-destructive/5 border border-destructive/20" : ""))}>
                          <div className="text-7xl md:text-8xl font-editorial font-bold tracking-tight mb-2 flex items-baseline justify-center md:justify-end" style={{ color: colors.no, opacity: isClosed && !isResolved ? 0.75 : 1 }}>
                            {liveNoPercent.toFixed(0)}<span className="text-4xl ml-1" style={{ color: colors.no, opacity: 0.6 }}>%</span>
                          </div>
                          <div className="font-mono-numbers text-sm font-bold tracking-wider text-muted-foreground">
                            {isBuzzOrBoo ? 'BOO' : isHotOrNot ? 'NOT HOT' : 'NO'} {isResolved ? 'FINAL SHARE' : isClosed && !isResolved ? 'AT CLOSE' : 'PROBABILITY'}
                            {!isResolved && !isClosed && crowdLeadsNo && <span className="ml-1.5 text-destructive">↑</span>}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {!tallyLoading && (liveTotalCount > 0 || isResolved) && (
                <div className="h-4 w-full bg-secondary rounded-full overflow-hidden flex relative">
                  <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${liveYesPercent}%`, backgroundColor: colors.yes }} />
                  <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${liveNoPercent}%`, backgroundColor: colors.no }} />
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-background z-20 -ml-[1px]" />
                </div>
                )}
                {!tallyLoading && (liveTotalCount > 0 || isResolved) && (
                  <div className="flex justify-between mt-3 text-sm font-mono-numbers text-muted-foreground">
                    <span>{formatNumber(liveYesCount)} {isBuzzOrBoo ? "BUZZ" : isHotOrNot ? "HOT" : isHeadToHead && h2hData?.entityA ? h2hData.entityA : "YES"}</span>
                    <span className="text-xs font-medium">
                    {isClosed && !isResolved
                      ? '🔒 at close'
                      : liveYesPercent === liveNoPercent && liveTotalCount > 0
                      ? `⚖️ ${formatNumber(liveTotalCount)} total — split`
                      : `${formatNumber(liveTotalCount)} total ${isBuzzOrBoo ? 'verdicts' : isHotOrNot ? 'verdicts' : isHeadToHead ? 'picks' : 'predictions'}`}
                  </span>
                    <span>{formatNumber(liveNoCount)} {isBuzzOrBoo ? "BOO" : isHotOrNot ? "NOT" : isHeadToHead && h2hData?.entityB ? h2hData.entityB : "NO"}</span>
                  </div>
                )}
              </div>
            ) : null}

            {/* Market Metadata */}
            <div className={`grid grid-cols-1 gap-4 ${isHeadToHead && h2hData?.metric ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
              {isHeadToHead && h2hData?.metric && (
                <div className="bg-muted/40 p-4 rounded-xl flex items-start gap-3 order-first md:order-none">
                  <span className="text-base shrink-0 mt-0.5">📏</span>
                  <div>
                    <div className="text-sm font-bold mb-1">Metric</div>
                    <div className="text-sm text-muted-foreground">{h2hData.metric}{h2hData.period ? ` · ${h2hData.period}` : ""}</div>
                  </div>
                </div>
              )}
              {market.category && (
                <a href={`/markets?category=${market.category}`} className="bg-muted/40 hover:bg-muted/70 transition-colors p-4 rounded-xl flex items-start gap-3 group">
                  <span className="text-base shrink-0 mt-0.5">🏷️</span>
                  <div>
                    <div className="text-sm font-bold mb-1">Category</div>
                    <div className="text-sm text-muted-foreground capitalize group-hover:text-foreground transition-colors">{market.category.replace(/_/g, ' ').toLowerCase()} →</div>
                  </div>
                </a>
              )}
              <div className="bg-muted/40 p-4 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold mb-1">Resolution Source</div>
                  {market.resolutionSource ? (
                    /^https?:\/\//.test(market.resolutionSource) ? (
                      <a href={market.resolutionSource} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">{market.resolutionSource}</a>
                    ) : (
                      <div className="text-sm text-muted-foreground">{market.resolutionSource}</div>
                    )
                  ) : (
                    <div className="text-sm text-muted-foreground">Platform Admin Review</div>
                  )}
                </div>
              </div>
              {(() => {
                const fmtSlug = isBuzzOrBoo ? "BUZZ_OR_BOO" : isTheCall ? "THE_CALL" : isMultiChoice ? "MULTI_CHOICE" : market.marketFormat === "HOT_OR_NOT" ? "HOT_OR_NOT" : market.marketFormat === "HEAD_TO_HEAD" ? "HEAD_TO_HEAD" : "STANDARD";
                const fmtLabel = isBuzzOrBoo ? "Buzz or Boo" : isTheCall ? "The Call" : isMultiChoice ? "Buzz Battle" : market.marketFormat === "HOT_OR_NOT" ? "Hot or Not" : market.marketFormat === "HEAD_TO_HEAD" ? "Head to Head" : "Forecast";
                const fmtEmoji = isBuzzOrBoo ? "⚡" : isTheCall ? "🎯" : isMultiChoice ? "👑" : market.marketFormat === "HOT_OR_NOT" ? "🔥" : market.marketFormat === "HEAD_TO_HEAD" ? "⚔️" : "📊";
                return (
                  <a href={`/markets?format=${fmtSlug}`} className="bg-muted/40 hover:bg-muted/70 transition-colors p-4 rounded-xl flex items-start gap-3 group">
                    <span className="text-base shrink-0 mt-0.5">{fmtEmoji}</span>
                    <div>
                      <div className="text-sm font-bold mb-1">Format</div>
                      <div className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{fmtLabel} →</div>
                    </div>
                  </a>
                );
              })()}
              <div className="bg-muted/40 p-4 rounded-xl flex items-start gap-3">
                <Clock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold mb-1">Status</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    {isResolved ? (
                      <span className="flex items-center text-foreground font-medium">
                        {isBuzzOrBoo
                          ? `Sentiment locked in — ${market.resolvedOutcome === "YES" ? "⚡ BUZZ" : "👎 BOO"} won`
                          : isHotOrNot
                          ? `Verdict — ${market.resolvedOutcome === "YES" ? "🔥 Hot" : "❄️ Not Hot"}`
                          : isMultiChoice
                          ? `🏆 ${multiChoiceData?.contenders.find(c => c.key === market.resolvedOutcome)?.name ?? market.resolvedOutcome}`
                          : isTheCall
                          ? `🎯 ${theCallData?.options.find(o => o.key === market.resolvedOutcome)?.label ?? market.resolvedOutcome}`
                          : isHeadToHead
                          ? `🏆 ${market.resolvedOutcome === 'YES' ? (h2hData?.entityA ?? 'Side A') : (h2hData?.entityB ?? 'Side B')}`
                          : `Resolved — ${market.resolvedOutcome}`}
                      </span>
                    ) : isClosed ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="text-orange-500 font-medium">🔒 Closed for predictions</span>
                        {market.closesAt && (
                          <span className="text-xs text-muted-foreground/70">
                            Closed {new Date(market.closesAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </span>
                    ) : isScheduled ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <span className="font-medium text-amber-600 dark:text-amber-400">Scheduled</span>
                        </span>
                        {(market as any).scheduledFor && (
                          <span className="text-xs text-muted-foreground/70 pl-3.5">
                            Opens {new Date((market as any).scheduledFor).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date((market as any).scheduledFor).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                      </span>
                    ) : countdown.label ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full animate-pulse shrink-0", countdown.urgent ? "bg-red-500" : "bg-green-500")} />
                          <span className={cn(
                            "font-medium font-mono-numbers",
                            countdown.urgent ? "text-red-500" : "text-foreground"
                          )}>
                            {countdown.label}
                          </span>
                        </span>
                        {market.closesAt && (
                          <span className="text-xs text-muted-foreground/70 pl-3.5">
                            Closes {new Date(market.closesAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                      </span>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Closes {market.closesAt ? new Date(market.closesAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD'}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Created date */}
            {market.createdAt && (
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1.5 mt-1">
                <Clock className="w-3 h-3" />
                Posted {new Date(market.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}

            {/* Resolution Rules Drawer */}
            <ResolutionRulesDrawer market={market} />
          </div>

          {/* Right Sidebar — Action Area */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="sticky top-24 border-primary/20 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <h3 className="font-editorial text-2xl font-bold">
                    {isScheduled
                      ? "Opening Soon"
                      : isClosed
                      ? (isResolved
                          ? (isBuzzOrBoo || isHotOrNot) ? "Final Verdict" : isTheCall ? "Crowd's Pick" : isHeadToHead ? "Crowd's Pick" : isMultiChoice ? "Race Result" : "Final Result"
                          : "Predictions Closed")
                      : (isBuzzOrBoo || isHotOrNot) ? "Cast Your Verdict" : isTheCall ? "What's Your Pick?" : isHeadToHead ? "Pick the Winner" : isMultiChoice ? "Back a Contender" : "Make a Forecast"}
                  </h3>
                  {isScheduled ? (
                    <span className="text-xs font-mono-numbers font-bold px-2.5 py-1 rounded-full shrink-0 bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      🗓 Coming soon
                    </span>
                  ) : isResolved ? (
                    <span className="text-xs font-mono-numbers font-bold px-2.5 py-1 rounded-full shrink-0 bg-green-500/10 text-green-600 border border-green-500/20">
                      ✓ Resolved
                    </span>
                  ) : isClosed ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs font-mono-numbers font-bold px-2.5 py-1 rounded-full shrink-0 bg-muted text-muted-foreground border border-border">
                        🔒 Closed
                      </span>
                      {market.closesAt && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono-numbers text-right">
                          {new Date(market.closesAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  ) : !isClosed && countdown.label ? (
                    <span className={cn(
                      "text-xs font-mono-numbers font-bold px-2.5 py-1 rounded-full shrink-0",
                      countdown.urgent
                        ? "bg-red-500/10 text-red-500 border border-red-500/20"
                        : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                    )}>
                      {countdown.label}
                    </span>
                  ) : null}
                </div>
                {!isClosed && countdown.urgent && !userPrediction && (
                  <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium">
                    <span>⚠️</span>
                    <span>Closing soon — make your call now!</span>
                  </div>
                )}

                {/* Scheduled — not yet open (only when no existing pick) */}
                {isScheduled && !userPrediction && (
                  <div className="text-center py-6 bg-amber-500/8 rounded-xl border border-dashed border-amber-500/30 mb-4">
                    <span className="text-3xl block mb-2">🗓</span>
                    <p className="font-medium mb-1">Not yet open for predictions</p>
                    {(market as any).scheduledFor && (() => {
                      const openDate = new Date((market as any).scheduledFor);
                      const dateStr = openDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                      const timeStr = openDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                      return <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1">Opens {dateStr} at {timeStr}</p>;
                    })()}
                    {market.expireAt && (() => {
                      const closeDate = new Date(market.expireAt!);
                      const dateStr = closeDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                      const timeStr = closeDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                      return <p className="text-xs text-muted-foreground mt-1">Closes {dateStr} at {timeStr}</p>;
                    })()}
                    {countdown.label ? (
                      <p className="text-xs font-mono-numbers text-amber-600 dark:text-amber-400 mt-2">{countdown.label} until open</p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">Check back when it goes live.</p>
                    )}
                    {isAuthenticated && (
                      <button
                        onClick={handlePin}
                        disabled={pinMarket.isPending || unpinMarket.isPending}
                        className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
                      >
                        {isPinned ? '📌 Pinned' : '💡 Pin this market to track it'}
                      </button>
                    )}
                  </div>
                )}

                {/* Not authenticated — show prompt after guest taps a button */}
                {!isAuthenticated && !isClosed && !isScheduled && guestVoteChoice !== null && (
                  <div className="text-center py-5 bg-muted/50 rounded-xl border border-dashed border-border mb-4">
                    <p className="text-xs font-black tracking-widest text-primary/70 uppercase mb-1">
                      {guestVoteAttempts >= 3 ? "Lock in your calls" : "Nice call"}
                    </p>
                    <p className="font-medium mb-1">
                      {isBuzzOrBoo
                        ? `You said ${guestVoteChoice === "YES" ? "⚡ BUZZ" : "👎 BOO"} — join to record it`
                        : guestVoteAttempts >= 3
                        ? "You've made 3 guest calls. Join to keep your streak."
                        : "Join to lock in your pick and earn Forecast Points"}
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">Free forever · No credit card needed</p>
                    <div className="flex items-center justify-center gap-3">
                      <Button onClick={login} className="rounded-full px-6">Sign up free</Button>
                      <Button onClick={login} variant="outline" className="rounded-full px-6">Log in</Button>
                    </div>
                    {guestVoteAttempts < 3 && (
                      <button
                        onClick={() => setGuestVoteChoice(null)}
                        className="mt-2 text-xs text-muted-foreground/60 hover:text-muted-foreground underline"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                )}

                {/* Already predicted (show pick even for scheduled, as confirmation) */}
                {isAuthenticated && userPrediction && (() => {
                  const userChoice = userPrediction.choice;
                  const isCorrect = isResolved && market.resolvedOutcome != null && userChoice === market.resolvedOutcome;
                  const isWrong = isResolved && market.resolvedOutcome != null && userChoice !== market.resolvedOutcome;
                  // Crowd-position message — only while market is open and tally data exists
                  const crowdMessage = (() => {
                    if (isResolved) return null;
                    if (isBuzzOrBoo && buzzTallyTotal > 0) {
                      const pct = userChoice === "YES" ? liveBuzzPercent : liveBooPercent;
                      return pct >= 50 ? "YOU'RE WITH THE CROWD" : "YOU'RE IN THE MINORITY";
                    }
                    if (isHotOrNot && liveTotalCount > 0) {
                      const pct = userChoice === "YES" ? liveYesPercent : liveNoPercent;
                      return pct >= 50 ? "YOU'RE WITH THE CROWD" : "YOU'RE IN THE MINORITY";
                    }
                    if (isHeadToHead && liveTotalCount > 0) {
                      const pct = userChoice === "YES" ? liveYesPercent : liveNoPercent;
                      return pct >= 50 ? "YOU'RE WITH THE CROWD" : "YOU'RE IN THE MINORITY";
                    }
                    if (isTheCall && theCallCounts && totalTheCallVotes > 0) {
                      const myCount = theCallCounts[userChoice] ?? 0;
                      const isTop = !Object.entries(theCallCounts).some(([k, v]) => k !== userChoice && v > myCount);
                      return isTop ? "YOU'RE WITH THE CROWD" : "YOU'RE IN THE MINORITY";
                    }
                    if (isMultiChoice && contenderCounts && totalContenderVotes > 0) {
                      const myCount = contenderCounts[userChoice] ?? 0;
                      const isTop = !Object.entries(contenderCounts).some(([k, v]) => k !== userChoice && v > myCount);
                      return isTop ? "YOU'RE WITH THE CROWD" : "YOU'RE IN THE MINORITY";
                    }
                    if (!isBuzzOrBoo && !isHotOrNot && !isHeadToHead && !isTheCall && !isMultiChoice && liveTotalCount > 0) {
                      const pct = userChoice === "YES" ? liveYesPercent : liveNoPercent;
                      return pct >= 50 ? "YOU'RE WITH THE CROWD" : "YOU'RE IN THE MINORITY";
                    }
                    return null;
                  })();
                  return (
                    <div className={cn(
                      "mb-4 p-4 rounded-xl border",
                      isCorrect ? "border-green-500/40 bg-green-500/8" :
                      isWrong ? "border-red-500/20 bg-red-500/5" : ""
                    )} style={
                      !isCorrect && !isWrong && isBuzzOrBoo
                        ? { backgroundColor: userChoice === "YES" ? `${BUZZ_COLOR}18` : `${BOO_COLOR}18`, borderColor: userChoice === "YES" ? `${BUZZ_COLOR}44` : `${BOO_COLOR}44` }
                        : {}
                    }>
                      {isCorrect && (
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <p className="text-sm font-bold text-green-600 dark:text-green-400">
                            {isTheCall ? "You called it!" : isBuzzOrBoo ? "You read the room!" : "Correct call!"}
                          </p>
                        </div>
                      )}
                      {isWrong && (
                        <div className="flex items-center gap-2 mb-2">
                          <XCircle className="w-4 h-4 text-red-400" />
                          <p className="text-sm font-bold text-red-500 dark:text-red-400">Didn't land this time</p>
                        </div>
                      )}
                      {crowdMessage && (
                        <p className={cn(
                          "text-[10px] font-black tracking-widest uppercase mb-2",
                          crowdMessage === "YOU'RE IN THE MINORITY" ? "text-amber-500" : "text-primary/80"
                        )}>
                          {crowdMessage}
                        </p>
                      )}
                      <p className="text-sm font-bold mb-1" style={
                        isCorrect ? { color: "rgb(34 197 94)" } :
                        isWrong ? { color: "rgb(239 68 68)" } :
                        isBuzzOrBoo ? { color: userChoice === "YES" ? BUZZ_COLOR : BOO_COLOR } :
                        isHotOrNot ? { color: userChoice === "YES" ? "#f97316" : "#6b7280" } :
                        { color: "var(--primary)" }
                      }>
                        {isBuzzOrBoo || isHotOrNot ? "Your verdict" : isTheCall ? "Your pick" : isHeadToHead ? "Your pick" : isMultiChoice ? "My Pick" : "Your prediction"}
                      </p>
                      <p className="font-mono-numbers font-bold text-lg">
                        {isBuzzOrBoo
                          ? (userChoice === "YES"
                              ? `⚡ BUZZ${buzzTallyTotal > 0 ? ` · ${Math.round(liveBuzzPercent)}%` : ""}`
                              : `👎 BOO${buzzTallyTotal > 0 ? ` · ${Math.round(liveBooPercent)}%` : ""}`)
                          : isHotOrNot
                          ? (userChoice === "YES"
                              ? `🔥 Hot${liveTotalCount > 0 ? ` · ${Math.round(liveYesPercent)}%` : ""}`
                              : `❄️ Not Hot${liveTotalCount > 0 ? ` · ${Math.round(liveNoPercent)}%` : ""}`)
                          : isTheCall
                          ? (() => {
                              const label = theCallData?.options.find(o => o.key === userChoice)?.label ?? userChoice;
                              const count = theCallCounts?.[userChoice] ?? 0;
                              const pctStr = totalTheCallVotes > 0 ? ` · ${Math.round((count / totalTheCallVotes) * 100)}%` : "";
                              return `${label}${pctStr}`;
                            })()
                          : isMultiChoice
                          ? (() => {
                              const name = multiChoiceData?.contenders.find(c => c.key === userChoice)?.name ?? userChoice;
                              const count = contenderCounts?.[userChoice] ?? 0;
                              const pctStr = totalContenderVotes > 0 ? ` · ${Math.round((count / totalContenderVotes) * 100)}%` : "";
                              return `${name}${pctStr}`;
                            })()
                          : isHeadToHead
                          ? (userChoice === "YES"
                              ? `⚔️ ${h2hData?.entityA ?? 'Side A'}${liveTotalCount > 0 ? ` · ${Math.round(liveYesPercent)}%` : ""}`
                              : `⚔️ ${h2hData?.entityB ?? 'Side B'}${liveTotalCount > 0 ? ` · ${Math.round(liveNoPercent)}%` : ""}`)
                          : userChoice === 'YES' ? `✓ YES${liveTotalCount > 0 ? ` · ${Math.round(liveYesPercent)}%` : ""} · ${formatNumber(userPrediction.amount)} FP`
                          : userChoice === 'NO' ? `✗ NO${liveTotalCount > 0 ? ` · ${Math.round(liveNoPercent)}%` : ""} · ${formatNumber(userPrediction.amount)} FP`
                          : `${userChoice} · ${formatNumber(userPrediction.amount)} FP`}
                      </p>
                      {(isBuzzOrBoo || isTheCall || isHotOrNot || isHeadToHead || isMultiChoice) && (
                        <p className="text-xs text-muted-foreground font-mono-numbers mt-0.5">
                          {formatNumber(userPrediction.amount)} FP staked
                        </p>
                      )}
                      {isBuzzOrBoo && buzzTallyTotal > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>⚡ {Math.round(liveBuzzPercent)}% BUZZ</span>
                            <span>👎 {Math.round(liveBooPercent)}% BOO</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${liveBuzzPercent}%`, backgroundColor: BUZZ_COLOR }} />
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${liveBooPercent}%`, backgroundColor: BOO_COLOR }} />
                          </div>
                          {buzzTallyTotal > 0 && (
                            <p className="text-[10px] text-muted-foreground/60 text-center mt-1">{formatNumber(buzzTallyTotal)} {buzzTallyTotal === 1 ? 'verdict' : 'verdicts'} cast</p>
                          )}
                        </div>
                      )}
                      {isHotOrNot && liveTotalCount > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>🔥 {Math.round(liveYesPercent)}% HOT <span className="text-[9px] opacity-60">({formatNumber(liveYesCount)})</span></span>
                            <span><span className="text-[9px] opacity-60">({formatNumber(liveNoCount)})</span> {Math.round(liveNoPercent)}% NOT HOT ❄️</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${liveYesPercent}%`, backgroundColor: '#f97316' }} />
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${liveNoPercent}%`, backgroundColor: '#3b82f6' }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 text-center mt-1">{formatNumber(liveTotalCount)} {liveTotalCount === 1 ? 'verdict' : 'verdicts'} cast</p>
                        </div>
                      )}
                      {isHeadToHead && liveTotalCount > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span style={{ color: '#3b82f6' }}>{h2hData?.entityA ?? 'Side A'} {Math.round(liveYesPercent)}%</span>
                            <span style={{ color: '#8b5cf6' }}>{Math.round(liveNoPercent)}% {h2hData?.entityB ?? 'Side B'}</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${liveYesPercent}%`, backgroundColor: '#3b82f6' }} />
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${liveNoPercent}%`, backgroundColor: '#8b5cf6' }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 text-center mt-1">{formatNumber(liveTotalCount)} {liveTotalCount === 1 ? 'pick' : 'picks'} cast</p>
                        </div>
                      )}
                      {isTheCall && theCallData && totalTheCallVotes > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <p className="text-xs text-muted-foreground mb-1.5">Crowd distribution</p>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex gap-px">
                            {theCallData.options.map((opt, i) => {
                              const pct = Math.round(((theCallCounts[opt.key] ?? 0) / totalTheCallVotes) * 100);
                              const color = CONTENDER_COLORS[i % CONTENDER_COLORS.length];
                              return pct > 0 ? (
                                <div key={opt.key} className="h-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: color }} title={`${opt.label}: ${pct}%`} />
                              ) : null;
                            })}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {theCallData.options.map((opt, i) => {
                              const cnt = theCallCounts[opt.key] ?? 0;
                              const pct = Math.round((cnt / totalTheCallVotes) * 100);
                              const color = CONTENDER_COLORS[i % CONTENDER_COLORS.length];
                              return pct > 0 ? (
                                <span key={opt.key} className="text-[10px] text-muted-foreground">
                                  <span style={{ color }} className="font-bold">■</span> {opt.label.split(' ').slice(0, 3).join(' ')} {pct}% <span className="opacity-50">({cnt})</span>
                                </span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      )}
                      {isMultiChoice && multiChoiceData && totalContenderVotes > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <p className="text-xs text-muted-foreground mb-1.5">Crowd distribution</p>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex gap-px">
                            {multiChoiceData.contenders.map((c, i) => {
                              const pct = Math.round(((contenderCounts[c.key] ?? 0) / totalContenderVotes) * 100);
                              const color = CONTENDER_COLORS[i % CONTENDER_COLORS.length];
                              return pct > 0 ? (
                                <div key={c.key} className="h-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: color }} title={`${c.name}: ${pct}%`} />
                              ) : null;
                            })}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {multiChoiceData.contenders.map((c, i) => {
                              const cnt = contenderCounts[c.key] ?? 0;
                              const pct = Math.round((cnt / totalContenderVotes) * 100);
                              const color = CONTENDER_COLORS[i % CONTENDER_COLORS.length];
                              return (
                                <span key={c.key} className={`text-[10px] ${pct === 0 ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>
                                  <span style={{ color: pct === 0 ? '#6b728060' : color }} className="font-bold">■</span> {c.name.split(' ').slice(0, 2).join(' ')} {pct}%{cnt > 0 && <span className="opacity-50"> ({cnt})</span>}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {isResolved && (
                        <p className={cn(
                          "text-sm font-bold mt-2",
                          isCorrect ? "text-green-500" : "text-red-400"
                        )}>
                          {isCorrect
                            ? (userPrediction.tokensEarned != null
                                ? `+${formatNumber(userPrediction.tokensEarned)} FP earned`
                                : "+FP earned")
                            : `-${formatNumber(userPrediction.amount)} FP lost`}
                        </p>
                      )}
                      {userPrediction.createdAt && (
                        <p className="text-[11px] text-muted-foreground/60 mt-1.5" title={new Date(userPrediction.createdAt).toLocaleString()}>
                          Made {formatTimeAgo(userPrediction.createdAt)} · {new Date(userPrediction.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                      {isClosed && !isResolved && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                          ⏳ Awaiting resolution
                        </p>
                      )}
                      {isAuthenticated && authUser && (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <Link href={`/profile/${authUser.id}`} className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium flex items-center gap-1">
                            View your prediction history →
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {isClosed ? (
                  <div className="text-center py-6 bg-muted/50 rounded-xl border border-dashed border-border">
                    <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="font-medium">{isBuzzOrBoo || isTheCall || isHotOrNot || isHeadToHead || isMultiChoice ? "Voting has closed." : "Market is closed."}</p>
                    {market.closesAt && !isResolved && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Closed {new Date(market.closesAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · Awaiting resolution
                      </p>
                    )}
                    {/* Vote count snapshot */}
                    {liveTotalCount > 0 && !isResolved && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatNumber(liveTotalCount)} {isBuzzOrBoo || isHotOrNot ? (liveTotalCount === 1 ? 'verdict' : 'verdicts') : isTheCall || isHeadToHead ? (liveTotalCount === 1 ? 'pick' : 'picks') : isMultiChoice ? (liveTotalCount === 1 ? 'vote' : 'votes') : (liveTotalCount === 1 ? 'prediction' : 'predictions')} recorded
                      </p>
                    )}
                    {!isResolved && (
                      <div className="mt-4">
                        <Link href="/markets?status=OPEN" className="text-xs text-primary/70 hover:text-primary hover:underline">
                          Explore open markets →
                        </Link>
                      </div>
                    )}
                    {isResolved && (
                    <div className="mt-4">
                      <Link href="/markets?status=RESOLVED" className="text-xs text-primary hover:underline">
                        ← View resolved markets
                      </Link>
                    </div>
                    )}
                    {isResolved && (
                      <div className="mt-3">
                        {isBuzzOrBoo ? (
                          <p className="text-sm text-muted-foreground">
                            Final sentiment: <span className="font-bold" style={{ color: market.resolvedOutcome === "YES" ? BUZZ_COLOR : BOO_COLOR }}>
                              {market.resolvedOutcome === "YES" ? "⚡ BUZZ" : "👎 BOO"}
                            </span>
                          </p>
                        ) : isTheCall ? (
                          <p className="text-sm text-muted-foreground">
                            Final pick:{" "}
                            <span className="font-bold text-foreground">
                              {theCallData?.options.find(o => o.key === market.resolvedOutcome)?.label ?? market.resolvedOutcome}
                            </span>
                          </p>
                        ) : isMultiChoice ? (
                          <p className="text-sm text-muted-foreground">
                            🏆 Winner:{" "}
                            <span className="font-bold text-foreground">
                              {multiChoiceData?.contenders.find(c => c.key === market.resolvedOutcome)?.name ?? market.resolvedOutcome}
                            </span>
                          </p>
                        ) : market.marketFormat === "HOT_OR_NOT" ? (
                          <p className="text-sm text-muted-foreground">
                            Final verdict:{" "}
                            <span className="font-bold" style={{ color: market.resolvedOutcome === "YES" ? "#f97316" : "#6b7280" }}>
                              {market.resolvedOutcome === "YES" ? "🔥 Hot" : "❄️ Not Hot"}
                            </span>
                          </p>
                        ) : isHeadToHead ? (
                          <p className="text-sm text-muted-foreground">
                            🏆 Winner:{" "}
                            <span className="font-bold text-foreground" style={{ color: market.resolvedOutcome === "YES" ? "#3B82F6" : "#8B5CF6" }}>
                              {market.resolvedOutcome === "YES" ? (h2hData?.entityA ?? 'Side A') : (h2hData?.entityB ?? 'Side B')}
                            </span>
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-2">
                            {market.resolvedOutcome === "YES"
                              ? <span className="font-bold text-green-600 dark:text-green-400">✓ Yes won</span>
                              : market.resolvedOutcome === "NO"
                              ? <span className="font-bold text-red-500">✗ No won</span>
                              : <span className="font-bold text-foreground">{market.resolvedOutcome}</span>}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : !userPrediction && !isScheduled && !isClosed && !isResolved ? (
                  <>
                    {/* BUZZ_OR_BOO / THE_CALL: one-tap verdict — no amount slider */}
                    {isBuzzOrBoo ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground text-center mb-4">One tap. No take-backs. BUZZ or BOO this take?</p>
                        {tallyLoading ? (
                          <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden mb-3 animate-pulse" />
                        ) : buzzTallyTotal > 0 ? (
                          <>
                            <div className="flex justify-between text-xs font-mono-numbers px-1 mb-1">
                              <span style={{ color: BUZZ_COLOR }}>⚡ {Math.round(liveBuzzPercent)}%</span>
                              <span className="text-muted-foreground/60">{formatNumber(buzzTallyTotal)} {buzzTallyTotal === 1 ? 'verdict' : 'verdicts'}</span>
                              <span style={{ color: BOO_COLOR }}>{Math.round(liveBooPercent)}% 👎</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex mb-3">
                              <div className="h-full rounded-l-full transition-all duration-700" style={{ width: `${liveBuzzPercent}%`, backgroundColor: BUZZ_COLOR }} />
                              <div className="h-full rounded-r-full transition-all duration-700" style={{ width: `${liveBooPercent}%`, backgroundColor: BOO_COLOR }} />
                            </div>
                          </>
                        ) : !isScheduled ? (
                          <div className="text-center mb-3">
                            <p className="text-xs text-muted-foreground/80 mb-1">
                              Est. return: <span className="font-mono-numbers font-semibold text-foreground">~{formatNumber(BUZZ_OR_BOO_STAKE * 2)}–{formatNumber(BUZZ_OR_BOO_STAKE * 5)} FP</span> · varies with the crowd
                            </p>
                            <p className="text-[11px] text-muted-foreground/50">No verdicts yet — yours will be first!</p>
                          </div>
                        ) : null}
                        {!tallyLoading && buzzTallyTotal > 0 && (
                          <div className="mb-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="text-center p-2 rounded-xl bg-muted/50 border border-border/40">
                                <div className="text-xs text-muted-foreground mb-0.5">BUZZ wins →</div>
                                <div className="text-sm font-bold font-mono-numbers" style={{ color: BUZZ_COLOR }}>~{Math.round(BUZZ_OR_BOO_STAKE * 100 / Math.max(liveBuzzPercent, 5))} FP</div>
                              </div>
                              <div className="text-center p-2 rounded-xl bg-muted/50 border border-border/40">
                                <div className="text-xs text-muted-foreground mb-0.5">BOO wins →</div>
                                <div className="text-sm font-bold font-mono-numbers" style={{ color: BOO_COLOR }}>~{Math.round(BUZZ_OR_BOO_STAKE * 100 / Math.max(liveBooPercent, 5))} FP</div>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground/50 text-center mt-1">Estimates based on current split — floor of 5% applies</p>
                          </div>
                        )}
                        <Button
                          size="lg"
                          className="w-full h-20 text-2xl font-bold rounded-2xl border-0 shadow-lg transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center justify-center gap-0.5"
                          style={{ backgroundColor: BUZZ_COLOR, color: "#1a1a1a", boxShadow: `0 8px 24px ${BUZZ_COLOR}55` }}
                          onClick={() => handlePredict("YES")}
                          disabled={isPredicting !== null || tokenBalance <= 0}
                        >
                          <span>{isPredicting === "YES" ? "Casting..." : "⚡ BUZZ"}</span>
                          {isPredicting !== "YES" && <span className="text-[11px] font-normal opacity-60">{buzzTallyTotal > 0 ? `${formatNumber(Math.round(liveBuzzPercent * buzzTallyTotal / 100))} verdicts` : '0 verdicts'}</span>}
                        </Button>
                        <Button
                          size="lg"
                          className="w-full h-20 text-2xl font-bold rounded-2xl border-0 shadow-lg transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center justify-center gap-0.5"
                          style={{ backgroundColor: BOO_COLOR, color: "#fff", boxShadow: `0 8px 24px ${BOO_COLOR}55` }}
                          onClick={() => handlePredict("NO")}
                          disabled={isPredicting !== null || tokenBalance <= 0}
                        >
                          <span>{isPredicting === "NO" ? "Casting..." : "👎 BOO"}</span>
                          {isPredicting !== "NO" && <span className="text-[11px] font-normal opacity-60">{buzzTallyTotal > 0 ? `${formatNumber(Math.round(liveBooPercent * buzzTallyTotal / 100))} verdicts` : '0 verdicts'}</span>}
                        </Button>
                        <p className="text-[11px] text-muted-foreground text-center">Uses {BUZZ_OR_BOO_STAKE} FP · Balance: {formatNumber(tokenBalance)} FP</p>
                        {tokenBalance <= 0 && !isScheduled && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-1">
                            ⚠️ You need FP to make a call — check back tomorrow for your daily top-up
                          </p>
                        )}
                      </div>
                    ) : isHotOrNot ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground text-center mb-4">One tap. No take-backs. HOT or NOT?</p>
                        {tallyLoading ? (
                          <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden mb-3 animate-pulse" />
                        ) : liveTotalCount > 0 ? (
                          <>
                            <div className="flex justify-between text-xs font-mono-numbers px-1 mb-1">
                              <span style={{ color: "#f97316" }}>🔥 {Math.round(liveYesPercent)}%</span>
                              <span className="text-muted-foreground/60">{formatNumber(liveTotalCount)} {liveTotalCount === 1 ? 'verdict' : 'verdicts'}</span>
                              <span style={{ color: "#6b7280" }}>{Math.round(liveNoPercent)}% ❄️</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex mb-3">
                              <div className="h-full rounded-l-full transition-all duration-700" style={{ width: `${liveYesPercent}%`, backgroundColor: "#f97316" }} />
                              <div className="h-full rounded-r-full transition-all duration-700" style={{ width: `${liveNoPercent}%`, backgroundColor: "#6b7280" }} />
                            </div>
                          </>
                        ) : !isScheduled ? (
                          <div className="text-center mb-3">
                            <p className="text-xs text-muted-foreground/80 mb-1">
                              Est. return: <span className="font-mono-numbers font-semibold text-foreground">~{formatNumber(HOT_OR_NOT_STAKE * 2)}–{formatNumber(HOT_OR_NOT_STAKE * 5)} FP</span> · varies with the crowd
                            </p>
                            <p className="text-[11px] text-muted-foreground/50">No verdicts yet — yours will be first!</p>
                          </div>
                        ) : null}
                        {!tallyLoading && liveTotalCount > 0 && (
                          <div className="mb-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="text-center p-2 rounded-xl bg-muted/50 border border-border/40">
                                <div className="text-xs text-muted-foreground mb-0.5">🔥 HOT wins →</div>
                                <div className="text-sm font-bold font-mono-numbers" style={{ color: "#f97316" }}>~{Math.round(HOT_OR_NOT_STAKE * 100 / Math.max(liveYesPercent, 5))} FP</div>
                              </div>
                              <div className="text-center p-2 rounded-xl bg-muted/50 border border-border/40">
                                <div className="text-xs text-muted-foreground mb-0.5">❄️ NOT wins →</div>
                                <div className="text-sm font-bold font-mono-numbers" style={{ color: "#6b7280" }}>~{Math.round(HOT_OR_NOT_STAKE * 100 / Math.max(liveNoPercent, 5))} FP</div>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground/50 text-center mt-1">Estimates based on current split — floor of 5% applies</p>
                          </div>
                        )}
                        <Button
                          size="lg"
                          className="w-full h-20 text-2xl font-bold rounded-2xl border-0 shadow-lg transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center justify-center gap-0.5"
                          style={{ backgroundColor: "#f97316", color: "#fff", boxShadow: "0 8px 24px #f9731655" }}
                          onClick={() => handlePredict("YES")}
                          disabled={isPredicting !== null || tokenBalance <= 0}
                        >
                          <span>{isPredicting === "YES" ? "Casting..." : "🔥 HOT"}</span>
                          {isPredicting !== "YES" && <span className="text-[11px] font-normal opacity-60">{liveTotalCount > 0 ? `${formatNumber(liveYesCount)} verdicts` : '0 verdicts'}</span>}
                        </Button>
                        <Button
                          size="lg"
                          className="w-full h-20 text-2xl font-bold rounded-2xl border-0 shadow-lg transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center justify-center gap-0.5"
                          style={{ backgroundColor: "#374151", color: "#e5e7eb", boxShadow: "0 8px 24px #37415155" }}
                          onClick={() => handlePredict("NO")}
                          disabled={isPredicting !== null || tokenBalance <= 0}
                        >
                          <span>{isPredicting === "NO" ? "Casting..." : "❄️ NOT HOT"}</span>
                          {isPredicting !== "NO" && <span className="text-[11px] font-normal opacity-60">{liveTotalCount > 0 ? `${formatNumber(liveNoCount)} verdicts` : '0 verdicts'}</span>}
                        </Button>
                        <p className="text-[11px] text-muted-foreground text-center">Uses {HOT_OR_NOT_STAKE} FP · Balance: {formatNumber(tokenBalance)} FP</p>
                        {tokenBalance <= 0 && !isScheduled && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-1">
                            ⚠️ You need FP to make a call — check back tomorrow for your daily top-up
                          </p>
                        )}
                      </div>
                    ) : isTheCall && theCallData ? (
                      /* THE_CALL: pick one option — fixed stake, no slider */
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground text-center mb-4">Pick one. No take-backs. Where does the crowd land?</p>
                        {/* Return hint — shown above buttons */}
                        {totalTheCallVotes === 0 && !isScheduled && !tallyLoading && (
                          <p className="text-[11px] text-muted-foreground text-center mb-2">
                            Uses {THE_CALL_STAKE} FP · Est. return: ~{formatNumber(Math.round(THE_CALL_STAKE * 2))}–{formatNumber(Math.round(THE_CALL_STAKE * 5))} FP · varies by crowd
                          </p>
                        )}
                        {totalTheCallVotes > 0 && (() => {
                          const topKey = Object.entries(theCallCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
                          const topPct = topKey && totalTheCallVotes > 0 ? (theCallCounts[topKey] / totalTheCallVotes) * 100 : 50;
                          const minPct = Math.max(5, Math.min(...Object.values(theCallCounts).map(c => totalTheCallVotes > 0 ? (c / totalTheCallVotes) * 100 : 50)));
                          const maxPayout = Math.round(THE_CALL_STAKE * (100 / minPct));
                          const minPayout = Math.round(THE_CALL_STAKE * (100 / Math.max(topPct, 5)));
                          return (
                            <p className="text-[11px] text-muted-foreground text-center mb-2">
                              {minPayout !== maxPayout
                                ? `Est. return: ~${formatNumber(minPayout)}–${formatNumber(maxPayout)} FP depending on pick`
                                : `Est. return: ~${formatNumber(minPayout)} FP`}
                            </p>
                          );
                        })()}
                        {tokenBalance <= 0 && !isScheduled && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 text-center mb-2 font-medium">
                            ⚠ Your balance is 0 FP — check back tomorrow for your daily top-up
                          </p>
                        )}
                        {tallyLoading ? (
                          <div className="space-y-2 mb-2">
                            {[0,1,2].map(i => <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />)}
                          </div>
                        ) : totalTheCallVotes === 0 && !isScheduled && (
                          <p className="text-xs text-muted-foreground/70 text-center mb-1">No picks yet — yours will be first!</p>
                        )}
                        {(() => {
                          const maxTheCallCount = totalTheCallVotes > 0 ? Math.max(...theCallData.options.map(o => theCallCounts[o.key] ?? 0)) : 0;
                          return theCallData.options.map((o, i) => {
                            const color = THE_CALL_COLORS[i % THE_CALL_COLORS.length];
                            const count = theCallCounts[o.key] ?? 0;
                            const pct = totalTheCallVotes > 0 ? Math.round((count / totalTheCallVotes) * 100) : null;
                            const isLeadingBtn = totalTheCallVotes > 0 && count === maxTheCallCount && count > 0;
                            return (
                              <div key={o.key} className="space-y-1">
                                <Button
                                  size="lg"
                                  className="w-full h-14 text-base rounded-2xl border-0 font-bold transition-all hover:-translate-y-0.5 active:scale-95 flex items-center justify-between gap-3"
                                  style={{ backgroundColor: color, color: i === 0 ? "#1a1a1a" : "#fff", boxShadow: `0 6px 20px ${color}55` }}
                                  onClick={() => handlePredict(o.key)}
                                  disabled={isPredicting !== null || tokenBalance <= 0 || tallyLoading}
                                >
                                  <span className="flex items-center gap-2">
                                    {isPredicting === o.key ? "Casting..." : o.label}
                                    {isLeadingBtn && isPredicting !== o.key && <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 bg-black/10 px-1.5 py-0.5 rounded">Leading</span>}
                                  </span>
                                  {isPredicting !== o.key && (
                                    <span className="text-xs font-mono-numbers opacity-70">
                                      {pct !== null
                                        ? `${count.toLocaleString()} · ${pct}% · ~${Math.round(THE_CALL_STAKE * 100 / Math.max(pct, 5))} FP est.`
                                        : '0 picks'}
                                    </span>
                                  )}
                                </Button>
                                {pct !== null && (
                                  <div className="h-1 w-full bg-secondary/50 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color + "bb" }} />
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                        <p className="text-[11px] text-muted-foreground text-center">Uses {THE_CALL_STAKE} FP · Balance: {formatNumber(tokenBalance)} FP</p>
                      </div>
                    ) : (
                      <>
                        {isHeadToHead && (
                          <p className="text-xs text-muted-foreground text-center mb-4">Pick a side. No take-backs. Who does the city back?</p>
                        )}
                        <div className="mb-6">
                          <div className="flex justify-between items-end mb-4">
                            <div>
                              <label className="text-sm font-bold tracking-tight">{isMultiChoice ? "Amount to Back" : "Amount to Predict"}</label>
                              <p className="text-[11px] text-muted-foreground mt-0.5">Balance: {formatNumber(tokenBalance)} FP</p>
                            </div>
                            <span className="font-mono-numbers text-2xl font-bold text-primary">
                              {formatNumber(amount[0])} <span className="text-sm text-muted-foreground font-sans">FP</span>
                            </span>
                          </div>
                          <Slider
                            value={amount}
                            onValueChange={setAmount}
                            max={sliderMax}
                            min={sliderMin}
                            step={10}
                            className="py-4"
                            disabled={tokenBalance <= 0}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground font-mono-numbers mt-1 mb-3">
                            <span>{sliderMin} FP min</span>
                             <span>{sliderMax} FP max</span>
                          </div>
                          {/* Quick-pick presets */}
                          {tokenBalance > 0 && (
                            <div className="flex gap-1.5 flex-wrap">
                              {[10, 25, 50, 100].filter(v => v >= sliderMin && v <= sliderMax).map(v => (
                                <button
                                  key={v}
                                  onClick={() => setAmount([v])}
                                  className={`px-2.5 py-1 rounded-full text-xs font-mono-numbers font-bold border transition-all ${
                                    amount[0] === v
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary bg-transparent"
                                  }`}
                                >
                                  {v}
                                </button>
                              ))}
                              {sliderMax > 100 && (
                                <button
                                  onClick={() => setAmount([Math.min(Math.round(tokenBalance * 0.5 / 10) * 10, sliderMax)])}
                                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary bg-transparent`}
                                >
                                  50%
                                </button>
                              )}
                            </div>
                          )}
                          {isAuthenticated && tokenBalance <= 0 && !isScheduled && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                              ⚠️ Your balance is 0 FP — check back tomorrow for your daily top-up
                            </p>
                          )}
                          {isAuthenticated && tokenBalance > 0 && tokenBalance < TOPUP_THRESHOLD && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                              <span>⚡</span>
                              Low balance — you'll receive a daily top-up to {TOPUP_THRESHOLD} FP when you next visit.
                            </p>
                          )}
                        </div>

                        {/* Multi-choice: contender buttons */}
                        {isMultiChoice && multiChoiceData ? (
                          <div className="space-y-2">
                            {/* Estimated payout hint like THE_CALL */}
                             {!tallyLoading && totalContenderVotes > 0 && amount[0] > 0 && (() => {
                              const sortedContenders = [...multiChoiceData.contenders].map(c => ({
                                ...c, pct: Math.round(((contenderCounts[c.key] ?? 0) / totalContenderVotes) * 100)
                              })).sort((a, b) => b.pct - a.pct);
                              const leader = sortedContenders[0];
                              const underdog = sortedContenders[sortedContenders.length - 1];
                              const leaderPay = leader && leader.pct > 0 ? Math.round(amount[0] * 100 / leader.pct) : null;
                              const underdogPay = underdog && underdog.pct > 0 && underdog.pct < (leader?.pct ?? 100) ? Math.round(amount[0] * 100 / underdog.pct) : null;
                              return (
                                <p className="text-xs text-muted-foreground text-center mb-2">
                                  Est. payout: Leader ~{leaderPay != null ? `${formatNumber(leaderPay)} FP` : '—'}
                                  {underdogPay != null && ` · underdog up to ~${formatNumber(underdogPay)} FP`} <span className="opacity-50">(varies with crowd)</span>
                                 </p>
                              );
                            })()}
                             {tallyLoading ? (
                              <div className="space-y-2 mb-2">
                                {[0,1,2].map(i => <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />)}
                              </div>
                            ) : totalContenderVotes === 0 && !isScheduled ? (
                              <div className="text-center mb-3">
                                {amount[0] > 0 && (
                                  <p className="text-xs text-muted-foreground/80 mb-1">
                                    Est. return: <span className="font-mono-numbers font-semibold text-foreground">~{formatNumber(amount[0] * 2)}–{formatNumber(amount[0] * 5)} FP</span> · varies by contender picked
                                  </p>
                                )}
                                <p className="text-[11px] text-muted-foreground/50">No votes yet — back the first contender!</p>
                              </div>
                            ) : null}
                            {(() => {
                              // Keep source order so buttons don't jump as live tally refreshes.
                              // "Leading" badge still shows the current leader separately.
                              const srcIdx = (key: string) => multiChoiceData.contenders.findIndex(c2 => c2.key === key);
                              const sortedBtns = [...multiChoiceData.contenders];
                              const maxMultiVotes = Math.max(0, ...multiChoiceData.contenders.map(c2 => contenderCounts[c2.key] ?? 0));
                            return sortedBtns.map((c) => {
                              const i = srcIdx(c.key);
                                const voteCount = contenderCounts[c.key] ?? 0;
                                const votePct = totalContenderVotes > 0 ? Math.round((voteCount / totalContenderVotes) * 100) : null;
                                const isLeadingBtn = totalContenderVotes > 0 && voteCount === maxMultiVotes && voteCount > 0;
                                const bColor = CONTENDER_COLORS[i % CONTENDER_COLORS.length];
                                return (
                                  <div key={c.key} className="space-y-1">
                                    <Button
                                      size="lg"
                                      className="w-full h-12 text-base rounded-xl border-0 font-bold transition-transform hover:-translate-y-0.5 flex justify-between items-center px-4"
                                      style={{
                                        backgroundColor: bColor,
                                        color: i === 0 ? "#1a1a1a" : "#fff",
                                      }}
                                      onClick={() => handlePredict(c.key)}
                                      disabled={isPredicting !== null || tokenBalance <= 0 || amount[0] <= 0}
                                    >
                                      <span className="flex items-center gap-2">
                                        {isPredicting === c.key ? "Casting..." : c.name}
                                        {isLeadingBtn && <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 bg-black/10 px-1.5 py-0.5 rounded">Leading</span>}
                                      </span>
                                      {isPredicting !== c.key && (
                                        votePct !== null ? (
                                          <span className="text-xs opacity-70 font-normal ml-2">{votePct}% · {voteCount.toLocaleString()} vote{voteCount !== 1 ? "s" : ""} · ~{Math.round(amount[0] * 100 / Math.max(votePct, 5))} FP</span>
                                        ) : voteCount > 0 ? (
                                          <span className="text-xs opacity-70 font-normal ml-2">{voteCount} vote{voteCount !== 1 ? "s" : ""}</span>
                                        ) : (
                                          <span className="text-xs opacity-40 font-normal ml-2">0 votes</span>
                                        )
                                      )}
                                    </Button>
                                    {votePct !== null && (
                                      <div className="h-1 w-full bg-secondary/50 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(votePct, 2)}%`, backgroundColor: bColor + "bb" }} />
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          <p className="text-[11px] text-muted-foreground text-center mt-1">
                            {totalContenderVotes > 0
                              ? `${formatNumber(totalContenderVotes)} total vote${totalContenderVotes !== 1 ? 's' : ''} across all contenders`
                              : 'No votes yet — be the first to back a contender'}
                          </p>
                          <p className="text-[11px] text-muted-foreground text-center">Stakes {formatNumber(amount[0])} FP · Balance: {formatNumber(tokenBalance)} FP</p>
                          </div>
                        ) : isHeadToHead ? (
                          /* HEAD_TO_HEAD: entity A vs entity B buttons */
                          <>
                            {/* H2H tally loading skeleton */}
                            {tallyLoading && (
                              <div className="h-8 w-full bg-muted/40 rounded-lg animate-pulse mb-3" />
                            )}
                            {/* H2H payout estimate */}
                            {!tallyLoading && liveTotalCount === 0 && !isScheduled && amount[0] > 0 && (
                              <div className="text-center mb-3">
                                <p className="text-xs text-muted-foreground/80 mb-1">
                                  Est. return: <span className="font-mono-numbers font-semibold text-foreground">~{formatNumber(amount[0] * 2)}–{formatNumber(amount[0] * 5)} FP</span> · varies with how the crowd picks
                                </p>
                                <p className="text-[11px] text-muted-foreground/50">No picks yet — yours will be first!</p>
                              </div>
                            )}
                            {!tallyLoading && liveTotalCount > 0 && amount[0] > 0 && (
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                {[
                                  { label: h2hData?.entityA ?? 'Side A', pct: liveYesPercent },
                                  { label: h2hData?.entityB ?? 'Side B', pct: liveNoPercent },
                                ].map(({ label, pct }) => {
                                  const payout = pct > 0 ? Math.round(amount[0] * 100 / pct) : null;
                                  return (
                                    <div key={label} className="text-center text-xs text-muted-foreground bg-muted/40 rounded-lg py-1.5 px-2">
                                      <span className="font-medium">{label} wins → </span>
                                      <span className="font-mono-numbers font-semibold text-foreground">{payout != null ? `~${formatNumber(payout)} FP` : '—'}</span>
                                    </div>
                                  );
                                })}
                                
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                              <Button
                                size="lg"
                                className="h-16 text-base rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0 flex flex-col gap-0.5 font-bold"
                                style={{ backgroundColor: "#3B82F6", color: "#fff", boxShadow: "0 8px 24px #3B82F655" }}
                                onClick={() => handlePredict("YES")}
                                disabled={isPredicting !== null || tokenBalance <= 0 || amount[0] <= 0}
                              >
                                <span>{isPredicting === "YES" ? "Casting..." : `⚔️ ${h2hData?.entityA ?? 'Side A'}`}</span>
                                {liveTotalCount > 0 && <span className="text-xs opacity-70 font-mono-numbers font-normal">{Math.round(liveYesPercent)}%</span>}
                              </Button>
                              <Button
                                size="lg"
                                className="h-16 text-base rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0 flex flex-col gap-0.5 font-bold"
                                style={{ backgroundColor: "#8B5CF6", color: "#fff", boxShadow: "0 8px 24px #8B5CF655" }}
                                onClick={() => handlePredict("NO")}
                                disabled={isPredicting !== null || tokenBalance <= 0 || amount[0] <= 0}
                              >
                                <span>{isPredicting === "NO" ? "Casting..." : `⚔️ ${h2hData?.entityB ?? 'Side B'}`}</span>
                                {liveTotalCount > 0 && <span className="text-xs opacity-70 font-mono-numbers font-normal">{Math.round(liveNoPercent)}%</span>}
                              </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground text-center mt-2">Stakes {formatNumber(amount[0])} FP · Balance: {formatNumber(tokenBalance)} FP</p>
                            {tokenBalance <= 0 && !isScheduled && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-1">
                                ⚠️ You need FP to make a call — check back tomorrow for your daily top-up
                              </p>
                            )}
                          </>
                        ) : (
                          /* Standard YES/NO buttons */
                          <>
                            {/* Tally loading skeleton for payout area */}
                            {tallyLoading && (
                              <div className="h-8 w-full bg-muted/40 rounded-lg animate-pulse mb-3" />
                            )}
                            {/* Estimated payout hint */}
                            {!tallyLoading && liveTotalCount > 0 && amount[0] > 0 && (
                              <div className="mb-3">
                                <div className="grid grid-cols-2 gap-2">
                                  {[
                                    { label: "YES", pct: liveYesPercent },
                                    { label: "NO", pct: liveNoPercent },
                                  ].map(({ label, pct }) => {
                                    const payout = pct > 0 ? Math.round(amount[0] * 100 / pct) : null;
                                    return (
                                      <div key={label} className="text-center text-xs text-muted-foreground bg-muted/40 rounded-lg py-1.5 px-2">
                                        <span className="font-medium">{label} wins → </span>
                                        <span className="font-mono-numbers font-semibold text-foreground">{payout != null ? `~${formatNumber(payout)} FP` : '—'}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-[10px] text-muted-foreground/50 text-center mt-1">Est. · varies with crowd split</p>
                              </div>
                            )}
                            {!tallyLoading && liveTotalCount === 0 && !isScheduled && amount[0] > 0 && (
                              <div className="text-center mb-3">
                                <p className="text-xs text-muted-foreground/80 mb-1">
                                  Est. return: <span className="font-mono-numbers font-semibold text-foreground">~{formatNumber(amount[0] * 2)}–{formatNumber(amount[0] * 5)} FP</span> · varies with the crowd split
                                </p>
                                <p className="text-[11px] text-muted-foreground/50">No predictions yet — yours will be first</p>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                              <Button
                                size="lg"
                                className="h-16 text-xl rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0 flex flex-col gap-0.5"
                                style={{ backgroundColor: colors.yes, color: "#fff", boxShadow: `0 8px 24px ${colors.yesSoft}` }}
                                onClick={() => handlePredict("YES")}
                                disabled={isPredicting !== null || tokenBalance <= 0 || amount[0] <= 0}
                              >
                                <span>{isPredicting === "YES" ? "Casting..." : "Yes ✓"}</span>
                                <span className="text-xs opacity-70 font-mono-numbers font-normal">{liveTotalCount > 0 ? `${Math.round(liveYesPercent)}% · ${formatNumber(liveYesCount)}` : '0 predictions'}</span>
                              </Button>
                              <Button
                                size="lg"
                                className="h-16 text-xl rounded-xl shadow-lg transition-transform hover:-translate-y-1 border-0 flex flex-col gap-0.5"
                                style={{ backgroundColor: colors.no, color: "#fff", boxShadow: `0 8px 24px ${colors.noSoft}` }}
                                onClick={() => handlePredict("NO")}
                                disabled={isPredicting !== null || tokenBalance <= 0 || amount[0] <= 0}
                              >
                                <span>{isPredicting === "NO" ? "Casting..." : "No ✗"}</span>
                                <span className="text-xs opacity-70 font-mono-numbers font-normal">{liveTotalCount > 0 ? `${Math.round(liveNoPercent)}% · ${formatNumber(liveNoCount)}` : '0 predictions'}</span>
                              </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground text-center mt-2">Stakes {formatNumber(amount[0])} FP · Balance: {formatNumber(tokenBalance)} FP</p>
                            {tokenBalance <= 0 && (
                              <p className="text-[10px] text-amber-500/80 text-center mt-1 font-medium">⚠️ You need FP to make a call — check back tomorrow for your daily top-up</p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </>
                ) : null}

                {!isBuzzOrBoo && !isTheCall && !isMultiChoice && userTotalInvested > 0 && (
                  <div className="mt-6 pt-6 border-t border-border/50 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Your total position</p>
                    <p className="font-mono-numbers font-bold text-xl">{formatNumber(userTotalInvested)} FP</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Share Result Modal */}
            {showShareModal && market.resolvedOutcome && (
              <ShareResultModal
                market={market as any}
                buzzPercent={liveBuzzPercent}
                booPercent={liveBooPercent}
                buzzTotal={buzzTallyTotal}
                yesPercent={liveYesPercent}
                noPercent={liveNoPercent}
                totalCount={liveTotalCount}
                entityA={h2hData?.entityA}
                entityB={h2hData?.entityB}
                winnerLabel={
                  isMultiChoice
                    ? multiChoiceData?.contenders.find(c => c.key === market.resolvedOutcome)?.name
                    : isTheCall
                    ? theCallData?.options.find(o => o.key === market.resolvedOutcome)?.label
                    : undefined
                }
                userChoice={userPrediction?.choice ?? null}
                isCorrect={!!(userPrediction && market.resolvedOutcome && userPrediction.choice === market.resolvedOutcome)}
                onClose={() => setShowShareModal(false)}
              />
            )}
            {/* Related Markets — same category */}
            <RelatedMarketsSection marketId={market.id} category={market.category} marketFormat={market.marketFormat} />

            {/* Recent Activity */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-editorial text-xl font-bold">Recent Activity</h3>
                  <div className="flex items-center gap-3">
                    {predictions && predictions.length > 0 && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {predictions.length > 5 ? `Showing 5 of ${predictions.length} ${isMultiChoice ? 'votes' : isBuzzOrBoo || isHotOrNot ? 'verdicts' : isTheCall || isHeadToHead ? 'picks' : 'predictions'}` : `${predictions.length} recent ${predictions.length === 1 ? (isMultiChoice ? 'vote' : isBuzzOrBoo || isHotOrNot ? 'verdict' : isTheCall || isHeadToHead ? 'pick' : 'prediction') : (isMultiChoice ? 'votes' : isBuzzOrBoo || isHotOrNot ? 'verdicts' : isTheCall || isHeadToHead ? 'picks' : 'predictions')}`}
                      </span>
                    )}
                    {predictions && predictions.length > 5 && isAuthenticated && authUser && (
                      <Link href={`/profile/${authUser.id}`} className="text-xs text-primary/70 hover:text-primary transition-colors font-medium">
                        See all →
                      </Link>
                    )}
                    {isAuthenticated && authUser && (
                      <Link href={`/profile/${authUser.id}`} className="text-xs text-primary/70 hover:text-primary transition-colors font-medium">
                        My predictions →
                      </Link>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  {isPredictionsError ? (
                    <p className="text-sm text-muted-foreground text-center py-4">📡 Couldn't load activity</p>
                  ) : predictions === undefined ? (
                    <div className="space-y-3 animate-pulse">
                      {[1, 2, 3].map(i => <div key={i} className="h-11 bg-muted rounded-lg" />)}
                    </div>
                  ) : predictions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {isScheduled
                        ? `Activity will appear when the market opens${(market as any).scheduledFor ? ` — ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
                        : isClosed
                        ? "No activity recorded for this market."
                        : isBuzzOrBoo || isHotOrNot
                        ? "No verdicts yet. Cast the first one!"
                        : isTheCall
                        ? "No picks yet. Make the first call!"
                        : isMultiChoice
                        ? "No votes yet. Back the first contender!"
                        : "No predictions yet. Be the first!"}
                    </p>
                  ) : (
                    predictions.slice(0, 5).map(pred => {
                      const contenderName = isMultiChoice && multiChoiceData
                        ? multiChoiceData.contenders.find(c => c.key === pred.choice)?.name ?? pred.choice
                        : isBuzzOrBoo
                          ? (pred.choice === 'YES' ? '⚡ BUZZ' : '👎 BOO')
                          : isTheCall && theCallData
                          ? (theCallData.options.find(o => o.key === pred.choice)?.label ?? pred.choice)
                          : isHotOrNot
                          ? (pred.choice === 'YES' ? '🔥 HOT' : '❄️ NOT HOT')
                          : isHeadToHead && h2hData
                          ? (pred.choice === 'YES' ? `⚔️ ${h2hData.entityA ?? 'Side A'}` : pred.choice === 'NO' ? `⚔️ ${h2hData.entityB ?? 'Side B'}` : pred.choice)
                          : pred.choice === 'YES' ? '✅ YES' : pred.choice === 'NO' ? '❌ NO' : pred.choice;
                      const predResolved = isResolved && pred.isCorrect != null;
                      const predWon = predResolved && pred.isCorrect;
                      return (
                        <div key={pred.id} className={cn("flex justify-between items-center text-sm p-3 rounded-lg", predWon ? "bg-green-500/10" : predResolved ? "bg-destructive/10" : "bg-muted/30")}>
                          <div className="flex items-center gap-2 font-medium">
                            {predResolved ? (
                              predWon
                                ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                                : <XCircle className="w-4 h-4 text-destructive" />
                            ) : isMultiChoice ? (
                              <Crown className="w-4 h-4 text-primary" />
                            ) : isBuzzOrBoo ? (
                              <span>{pred.choice === 'YES' ? "⚡" : "👎"}</span>
                            ) : isTheCall ? (
                              <span>🎯</span>
                            ) : isHotOrNot ? (
                              <span>{pred.choice === 'YES' ? "🔥" : "❄️"}</span>
                            ) : isHeadToHead ? (
                              <span>⚔️</span>
                            ) : pred.choice === 'YES' ? (
                              <CheckCircle2 className="w-4 h-4" style={{ color: colors.yes }} />
                            ) : (
                              <XCircle className="w-4 h-4" style={{ color: colors.no }} />
                            )}
                            <Link href={`/profile/${pred.userId}`} className="hover:underline text-primary/70 hover:text-primary transition-colors">{(pred as any).username ?? `Forecaster #${pred.userId}`}</Link>
                            {" → "}<span className="text-foreground">{contenderName}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono-numbers font-bold text-xs tabular-nums">{formatNumber(pred.amount)} <span className="text-muted-foreground font-normal">FP</span></span>
                            {predResolved && (
                              <span className={cn("text-[10px] font-bold", predWon ? "text-green-600" : "text-destructive")}>
                                {predWon ? `+${formatNumber(pred.tokensEarned ?? 0)}` : `-${formatNumber(pred.amount)}`}
                              </span>
                            )}
                            {pred.createdAt && <span className="text-[10px] text-muted-foreground/70">{formatTimeAgo(pred.createdAt)}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom navigation CTA */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 pb-8">
          <Link
            href={market?.category ? `/markets?category=${market.category}` : '/markets'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted/60 hover:bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ← {market?.category ? `More ${getCategoryLabel(market.category)} markets` : 'All open markets'}
          </Link>
          {isScheduled ? (
            <Link
              href="/markets?status=SCHEDULED"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-sm font-medium text-amber-600 dark:text-amber-400 transition-colors"
            >
              {(market as any).scheduledFor
                ? `Opens ${new Date((market as any).scheduledFor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — see all upcoming →`
                : 'See upcoming markets →'}
            </Link>
          ) : isResolved ? (
            <>
              <Link
                href="/markets?status=OPEN"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 hover:bg-primary/20 text-sm font-medium text-primary transition-colors"
              >
                Explore open markets →
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted/60 hover:bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View leaderboard →
              </Link>
            </>
          ) : !isClosed && (
            <Link
              href="/markets?status=OPEN"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 hover:bg-primary/20 text-sm font-medium text-primary transition-colors"
            >
              Explore open markets →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
