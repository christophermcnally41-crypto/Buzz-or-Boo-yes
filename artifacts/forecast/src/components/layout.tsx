import { Link, useLocation } from "wouter";
import { Sparkles, Home, BarChart2, User, Shield, Search, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMe } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user: authUser, isAuthenticated, isLoading: authLoading, login, logout } = useAuth();

  // Load platform user data (balance etc) only when authenticated
  const { data: platformUser } = useGetMe({
    query: { enabled: isAuthenticated }
  });

  const userId = authUser?.id ?? null;

  const navItems = [
    { href: "/", label: "Discover", icon: Sparkles },
    { href: "/markets", label: "Markets", icon: Search },
    { href: "/leaderboard", label: "Top", icon: BarChart2 },
    ...(userId ? [{ href: `/profile/${userId}`, label: "Profile", icon: User }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-105 active:scale-95">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-editorial text-2xl font-bold tracking-tight">AHEAD</span>
          </Link>

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
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary",
                location === "/admin" ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Shield className="w-4 h-4" />
              Admin
            </Link>
          </nav>

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
