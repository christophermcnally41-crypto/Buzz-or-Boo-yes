import { useState } from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, TrendingUp } from "lucide-react";

interface PollOption {
  key: string;
  label: string;
  emoji?: string | null;
}

interface Poll {
  id: number;
  question: string;
  description?: string | null;
  options: PollOption[];
  tally: Record<string, number>;
  totalVotes: number;
  status: string;
}

const OPTION_COLORS = [
  { bg: "bg-[#CFEA3B]/20 hover:bg-[#CFEA3B]/40 border-[#CFEA3B]/40", bar: "#CFEA3B", text: "text-[#6b7c00]" },
  { bg: "bg-[#3ECDE8]/20 hover:bg-[#3ECDE8]/40 border-[#3ECDE8]/40", bar: "#3ECDE8", text: "text-[#1a7a8a]" },
  { bg: "bg-[#E87B3E]/20 hover:bg-[#E87B3E]/40 border-[#E87B3E]/40", bar: "#E87B3E", text: "text-[#8a3a10]" },
  { bg: "bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/40 border-[#8B5CF6]/40", bar: "#8B5CF6", text: "text-[#5b2fa6]" },
  { bg: "bg-[#EC4899]/20 hover:bg-[#EC4899]/40 border-[#EC4899]/40", bar: "#EC4899", text: "text-[#9a1060]" },
];

export function PollCard({ poll, onVote }: { poll: Poll; onVote?: (pollId: number, optionKey: string) => void }) {
  const [voted, setVoted] = useState<string | null>(null);
  const [localTally, setLocalTally] = useState<Record<string, number>>(poll.tally);
  const [localTotal, setLocalTotal] = useState(poll.totalVotes);
  const [submitting, setSubmitting] = useState(false);

  const handleVote = async (key: string) => {
    if (voted || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ optionKey: key }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalTally(data.tally);
        setLocalTotal(data.totalVotes);
        setVoted(key);
        onVote?.(poll.id, key);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const showResults = voted !== null;

  return (
    <div className="bg-card border border-border rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest text-primary uppercase mb-2">
            <MessageSquare className="w-3.5 h-3.5" /> Boston Says
          </div>
          <h3 className="font-editorial text-xl font-bold leading-tight">{poll.question}</h3>
          {poll.description && (
            <p className="text-sm text-muted-foreground mt-1">{poll.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 mt-1">
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="font-mono-numbers font-bold">{localTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-2">
        {poll.options.map((opt, i) => {
          const color = OPTION_COLORS[i % OPTION_COLORS.length];
          const count = localTally[opt.key] ?? 0;
          const pct = localTotal > 0 ? Math.round((count / localTotal) * 100) : 0;
          const isWinner = showResults && pct === Math.max(...poll.options.map(o => localTotal > 0 ? Math.round(((localTally[o.key] ?? 0) / localTotal) * 100) : 0));

          return (
            <button
              key={opt.key}
              onClick={() => handleVote(opt.key)}
              disabled={showResults || submitting}
              className={cn(
                "relative w-full text-left rounded-2xl border px-4 py-3 transition-all duration-200 overflow-hidden",
                showResults ? "cursor-default" : "cursor-pointer",
                voted === opt.key
                  ? `${color.bg} border-current`
                  : showResults
                  ? "bg-muted/30 border-border"
                  : `border-border hover:border-primary/40 ${color.bg}`
              )}
            >
              {/* Progress bar background */}
              {showResults && (
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-700 ease-out opacity-30 rounded-2xl"
                  style={{ width: `${pct}%`, backgroundColor: color.bar }}
                />
              )}

              <div className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium text-sm">
                  {opt.emoji && <span className="text-lg leading-none">{opt.emoji}</span>}
                  <span className={cn(showResults && isWinner && "font-bold")}>{opt.label}</span>
                </span>
                {showResults && (
                  <span className={cn("font-mono-numbers font-bold text-sm", color.text)}>
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {!showResults && (
        <p className="text-xs text-muted-foreground text-center">Tap to vote — results reveal instantly</p>
      )}
    </div>
  );
}
