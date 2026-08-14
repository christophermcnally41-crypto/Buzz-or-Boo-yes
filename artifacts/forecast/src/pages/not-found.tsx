import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-8xl font-editorial font-bold text-muted mb-6">404</div>
      <h1 className="text-3xl font-bold mb-4">Page not found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        The trend you are looking for hasn't materialized yet, or the URL is incorrect.
      </p>
      <div className="flex flex-wrap gap-3 justify-center mb-10">
        <Link href="/">
          <Button size="lg" className="rounded-full">Return Home</Button>
        </Link>
        <Link href="/markets">
          <Button size="lg" variant="outline" className="rounded-full">Browse Markets</Button>
        </Link>
        <Link href="/leaderboard">
          <Button size="lg" variant="outline" className="rounded-full">BuzzRank</Button>
        </Link>
      </div>
      <div className="flex flex-wrap gap-4 justify-center text-sm text-muted-foreground">
        <Link href="/markets?format=BUZZ_OR_BOO" className="hover:text-foreground transition-colors">⚡ Buzz or Boo</Link>
        <Link href="/markets?format=HOT_OR_NOT" className="hover:text-foreground transition-colors">🔥 Hot or Not</Link>
        <Link href="/markets?format=THE_CALL" className="hover:text-foreground transition-colors">🎯 The Call</Link>
        <Link href="/markets?format=MULTI_CHOICE" className="hover:text-foreground transition-colors">👑 Buzz Battle</Link>
        <Link href="/markets?format=HEAD_TO_HEAD" className="hover:text-foreground transition-colors">⚔️ Head to Head</Link>
      </div>
    </div>
  );
}
