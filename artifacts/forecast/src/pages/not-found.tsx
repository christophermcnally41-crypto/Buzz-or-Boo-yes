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
      <Link href="/">
        <Button size="lg" className="rounded-full">Return Home</Button>
      </Link>
    </div>
  );
}
