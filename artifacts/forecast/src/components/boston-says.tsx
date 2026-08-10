import { useState, useEffect } from "react";
import { PollCard } from "./poll-card";
import { Sparkles } from "lucide-react";

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

export function BostonSays() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    fetch("/api/polls", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setPolls(d.polls ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-16 border-t border-border/30">
        <div className="container mx-auto px-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-lg mb-6" />
          <div className="h-64 bg-muted animate-pulse rounded-3xl" />
        </div>
      </section>
    );
  }

  if (!polls.length) return null;

  const activePoll = polls[activeIndex];

  return (
    <section className="py-16 border-t border-border/30">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-widest uppercase mb-2">
              <Sparkles className="w-4 h-4" /> Boston Says
            </div>
            <h2 className="text-3xl md:text-4xl font-editorial font-bold mb-1">
              The City's Pulse
            </h2>
            <p className="text-muted-foreground font-medium max-w-md">
              Real-time opinion. No right answers — just Boston talking.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Active Poll — large */}
          <div className="lg:col-span-7">
            {activePoll && (
              <PollCard key={activePoll.id} poll={activePoll} />
            )}
          </div>

          {/* Poll Navigator — right sidebar */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <p className="text-xs font-bold tracking-widest text-white uppercase mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" style={{ color: "hsl(43 72% 48%)" }} /> More Questions
            </p>
            {polls.map((poll, i) => (
              <button
                key={poll.id}
                onClick={() => setActiveIndex(i)}
                className={`text-left px-4 py-3 rounded-2xl border-2 transition-all duration-200 text-sm font-medium leading-snug ${
                  i === activeIndex
                    ? "bg-white/10 border-white text-white shadow-[0_0_20px_rgba(255,255,255,0.22)]"
                    : "bg-card border-white/50 text-white/70 hover:border-white/80 hover:text-white hover:bg-white/5 hover:shadow-[0_0_12px_rgba(255,255,255,0.12)]"
                }`}
              >
                <span className="line-clamp-2">{poll.question}</span>
                <span className="text-xs font-mono-numbers mt-1 block opacity-50">
                  {poll.totalVotes.toLocaleString()} votes
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Conversion nudge — shown after the first vote */}
        <div className="mt-8 p-5 rounded-2xl bg-foreground/5 border border-border/50 flex items-center justify-between gap-4">
          <div>
            <p className="font-editorial font-bold text-lg">Opinions become predictions.</p>
            <p className="text-sm text-muted-foreground">The top Boston Says result auto-creates a real prediction market. Your read on the city could pay off.</p>
          </div>
          <a href="/markets" className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
            See Markets →
          </a>
        </div>
      </div>
    </section>
  );
}
