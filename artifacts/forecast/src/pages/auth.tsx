import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Trophy, BarChart2, Users } from "lucide-react";
import { Link } from "wouter";

const features = [
  {
    icon: Zap,
    title: "Make calls on culture",
    description: "Buzz or Boo, Hot or Not, Head to Head — put your cultural intuition on the record.",
  },
  {
    icon: BarChart2,
    title: "Earn Forecast Points",
    description: "Every correct prediction earns FP. Track your accuracy and build your BuzzScore.",
  },
  {
    icon: Trophy,
    title: "Climb the rankings",
    description: "Compare yourself against other Boston forecasters and see who really has the pulse.",
  },
  {
    icon: Users,
    title: "It's free to join",
    description: "No credit card. Just sign in with Replit and start making calls immediately.",
  },
];

export default function Auth() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, navigate] = useLocation();

  // Redirect authenticated users away
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md mx-auto text-center">
        {/* Logo / brand */}
        <div className="mb-8">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </span>
          <h1 className="font-editorial text-4xl font-bold mb-2">Join AHEAD</h1>
          <p className="text-muted-foreground text-lg">
            Boston's cultural prediction platform. Make a call before everyone else.
          </p>
        </div>

        {/* Primary CTA */}
        <div className="mb-10">
          <Button
            size="lg"
            className="w-full h-14 text-lg rounded-2xl font-bold gap-2"
            onClick={login}
            disabled={isLoading}
          >
            {isLoading ? "Loading…" : "Sign in to get started"}
            <ArrowRight className="w-5 h-5" />
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Uses Replit for authentication — no new password needed.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left mb-10">
          {features.map((f) => (
            <div key={f.title} className="flex gap-3 p-4 rounded-2xl bg-card border border-border/60">
              <f.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm mb-0.5">{f.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Browse without signing in */}
        <p className="text-sm text-muted-foreground">
          Just browsing?{" "}
          <Link href="/markets" className="text-primary hover:underline font-medium">
            Explore open markets →
          </Link>
        </p>
      </div>
    </div>
  );
}
