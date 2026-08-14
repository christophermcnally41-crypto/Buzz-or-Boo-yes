import { useState } from "react";
import { X, Link2, Check, Share2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn, formatNumber } from "@/lib/utils";

const BUZZ_COLOR = "#CFEA3B";
const BOO_COLOR = "#FF4444";

interface ShareResultModalProps {
  market: {
    id: number;
    question: string;
    resolvedOutcome: string | null | undefined;
    marketFormat?: string | null;
    totalPredictions: number;
  };
  // Tally data — pass whatever is available
  buzzPercent?: number;
  booPercent?: number;
  buzzTotal?: number;
  yesPercent?: number;
  noPercent?: number;
  totalCount?: number;
  // Format-specific labels
  entityA?: string;
  entityB?: string;
  winnerLabel?: string; // for MULTI_CHOICE and THE_CALL
  // User's own pick
  userChoice?: string | null;
  isCorrect?: boolean;
  onClose: () => void;
}

function getOutcomeDisplay(props: ShareResultModalProps) {
  const { market, entityA, entityB, winnerLabel } = props;
  const fmt = market.marketFormat;
  const out = market.resolvedOutcome;

  if (fmt === "BUZZ_OR_BOO") {
    return out === "YES"
      ? { emoji: "⚡", label: "BUZZ WINS", color: BUZZ_COLOR }
      : { emoji: "👎", label: "BOO WINS", color: BOO_COLOR };
  }
  if (fmt === "HOT_OR_NOT") {
    return out === "YES"
      ? { emoji: "🔥", label: "HOT — CONFIRMED", color: "#f97316" }
      : { emoji: "❄️", label: "NOT HOT — CONFIRMED", color: "#6b7280" };
  }
  if (fmt === "HEAD_TO_HEAD") {
    return out === "YES"
      ? { emoji: "⚔️", label: `${entityA ?? "Side A"} WINS`, color: "#3b82f6" }
      : { emoji: "⚔️", label: `${entityB ?? "Side B"} WINS`, color: "#8b5cf6" };
  }
  if (fmt === "MULTI_CHOICE" || fmt === "THE_CALL") {
    return { emoji: fmt === "THE_CALL" ? "🎯" : "🏆", label: `${winnerLabel ?? out} — WINNER`, color: "#8b5cf6" };
  }
  // STANDARD
  return out === "YES"
    ? { emoji: "✅", label: "YES — CONFIRMED", color: "#22c55e" }
    : { emoji: "❌", label: "NO — CONFIRMED", color: "#ef4444" };
}

export function ShareResultModal(props: ShareResultModalProps) {
  const { market, buzzPercent, booPercent, buzzTotal, yesPercent, noPercent, totalCount, userChoice, isCorrect, onClose } = props;
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/markets/${market.id}`;
  const outcome = getOutcomeDisplay(props);
  const fmt = market.marketFormat;
  const isBuzzOrBoo = fmt === "BUZZ_OR_BOO";

  const shareText = `${outcome.emoji} ${outcome.label} — ${market.question} | BuzzOrBoo`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, url });
      } catch {}
    } else {
      handleCopy();
    }
  };

  const hasBar = isBuzzOrBoo ? (buzzTotal ?? 0) > 0 : (totalCount ?? 0) > 0;
  const leftPct = isBuzzOrBoo ? (buzzPercent ?? 50) : (yesPercent ?? 50);
  const rightPct = isBuzzOrBoo ? (booPercent ?? 50) : (noPercent ?? 50);
  const leftLabel = isBuzzOrBoo ? "⚡ BUZZ" : fmt === "HOT_OR_NOT" ? "🔥 HOT" : "YES";
  const rightLabel = isBuzzOrBoo ? "👎 BOO" : fmt === "HOT_OR_NOT" ? "❄️ NOT" : "NO";
  const leftColor = isBuzzOrBoo ? BUZZ_COLOR : fmt === "HOT_OR_NOT" ? "#f97316" : "#22c55e";
  const rightColor = isBuzzOrBoo ? BOO_COLOR : fmt === "HOT_OR_NOT" ? "#6b7280" : "#ef4444";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* The shareable card */}
        <div
          className="rounded-2xl overflow-hidden border-2"
          style={{ borderColor: `${outcome.color}50`, background: "hsl(var(--background))" }}
        >
          {/* Header bar */}
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black tracking-widest text-muted-foreground uppercase">
                ⚡ BUZZORBOO
              </span>
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-2 py-0.5 rounded-full border border-border/50">
                RESOLVED
              </span>
            </div>

            {/* Outcome headline */}
            <div className="mb-4">
              <div
                className="text-3xl font-black tracking-tight leading-none mb-1"
                style={{ color: outcome.color }}
              >
                {outcome.emoji} {outcome.label}
              </div>
            </div>

            {/* Market question */}
            <p className="font-editorial text-base font-semibold text-balance leading-snug text-foreground mb-4">
              {market.question}
            </p>

            {/* Split bar */}
            {hasBar && (isBuzzOrBoo || fmt === "HOT_OR_NOT" || fmt === "STANDARD" || !fmt) && (
              <div className="mb-4">
                <div className="flex justify-between text-[11px] font-bold mb-1.5">
                  <span style={{ color: leftColor }}>{leftLabel} {Math.round(leftPct)}%</span>
                  <span style={{ color: rightColor }}>{Math.round(rightPct)}% {rightLabel}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                  <div className="h-full rounded-l-full" style={{ width: `${leftPct}%`, backgroundColor: leftColor }} />
                  <div className="h-full rounded-r-full" style={{ width: `${rightPct}%`, backgroundColor: rightColor }} />
                </div>
                <p className="text-[10px] text-muted-foreground/60 text-center mt-1">
                  {formatNumber(isBuzzOrBoo ? (buzzTotal ?? 0) : (totalCount ?? 0))} {(isBuzzOrBoo ? fmt === "BUZZ_OR_BOO" : true) ? "verdicts" : "calls"}
                </p>
              </div>
            )}

            {/* User's pick */}
            {userChoice && (
              <div className={cn(
                "rounded-xl p-3 border text-sm",
                isCorrect
                  ? "border-green-500/30 bg-green-500/8 text-green-400"
                  : "border-red-500/20 bg-red-500/5 text-red-400"
              )}>
                {isCorrect
                  ? `✓ You called it — ${userChoice === "YES" && isBuzzOrBoo ? "⚡ BUZZ" : userChoice === "NO" && isBuzzOrBoo ? "👎 BOO" : userChoice}`
                  : `✗ Didn't land — you picked ${userChoice === "YES" && isBuzzOrBoo ? "⚡ BUZZ" : userChoice === "NO" && isBuzzOrBoo ? "👎 BOO" : userChoice}`}
              </div>
            )}
          </div>

          {/* Footer URL */}
          <div className="px-5 py-3 bg-muted/30 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/50 font-mono truncate">buzzorboo.com/markets/{market.id}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <Button
            onClick={handleCopy}
            variant="outline"
            className="flex-1 rounded-full gap-1.5"
          >
            {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Link"}
          </Button>
          <Button
            onClick={handleNativeShare}
            className="flex-1 rounded-full gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
