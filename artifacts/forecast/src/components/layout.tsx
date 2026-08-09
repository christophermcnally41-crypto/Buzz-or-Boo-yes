import { Link, useLocation } from "wouter";
import { Sparkles, Home, BarChart2, User, Shield, Search, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user: authUser, isAuthenticated, isLoading: authLoading, login, logout } = useAuth();

  const { data: platformUser } = useGetMe({
    query: { enabled: isAuthenticated, queryKey: getGetMeQueryKey() }
  });

  const userId = authUser?.id ?? null;

  const navItems = [
    { href: "/", label: "What's Buzzing", icon: Sparkles },
    { href: "/markets", label: "Markets", icon: Search },
    { href: "/leaderboard", label: "BuzzRank", icon: BarChart2 },
    ...(userId ? [{ href: `/profile/${userId}`, label: "My Calls", icon: User }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 transition-transform hover:scale-[1.03] active:scale-95">
            <div
              className="p-1.5 rounded-md flex items-center justify-center"
              style={{ background: "hsl(268 50% 22%)" }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="logo-glint font-editorial tracking-tight select-none" style={{ fontWeight: 700, lineHeight: 1 }}>
              <span style={{ fontSize: "1.6rem" }}>buzz</span><span style={{ fontSize: "0.95rem", verticalAlign: "middle", letterSpacing: "0.02em" }}>or</span><span style={{ fontSize: "1.6rem" }}>boo</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth controls */}
          <div className="flex items-center gap-3">
            {isAuthenticated && platformUser ? (
              <>
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm font-mono-numbers font-medium text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  {formatNumber(platformUser.tokenBalance)} FP
                </div>
                <button
                  onClick={logout}
                  className="hidden md:flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </>
            ) : !authLoading ? (
              <button
                onClick={login}
                className="hidden md:flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <LogIn className="w-4 h-4" />
                Log in
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      {/* Desktop Footer */}
      <footer className="hidden md:block border-t border-border/50 bg-background/60 mt-8">
        <div className="container mx-auto px-4 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-sm" style={{ background: "hsl(268 50% 22%)" }}>
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-editorial tracking-tight leading-none" style={{ WebkitTextFillColor: "hsl(268 50% 28%)", fontWeight: 600, fontSize: "1rem" }}>
              <span style={{ fontSize: "1.1em" }}>buzz</span><span style={{ fontSize: "0.75em", opacity: 0.7 }}>or</span><span style={{ fontSize: "1.1em" }}>boo</span>
            </span>
            <span className="ml-2">Boston's cultural prediction engine.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/markets" className="hover:text-foreground transition-colors">Markets</Link>
            <Link href="/leaderboard" className="hover:text-foreground transition-colors">BuzzRank</Link>
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-1 hover:text-foreground transition-colors",
                location === "/admin" ? "text-primary" : ""
              )}
            >
              <Shield className="w-3 h-3" />
              Admin
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background/90 backdrop-blur-lg pb-safe">
        <div className="flex items-center justify-around p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 min-w-[64px] rounded-xl transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive && "animate-slide-up")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          {!isAuthenticated && !authLoading && (
            <button
              onClick={login}
              className="flex flex-col items-center gap-1 p-2 min-w-[64px] rounded-xl text-muted-foreground hover:text-primary transition-colors"
            >
              <LogIn className="w-5 h-5" />
              <span className="text-[10px] font-medium">Log in</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
