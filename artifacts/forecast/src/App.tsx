import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { Layout } from '@/components/layout';
import { useAuth } from '@workspace/replit-auth-web';
import { useGetCurrentAuthUser, getGetCurrentAuthUserQueryKey } from '@workspace/api-client-react';
import { Redirect } from 'wouter';

// Pages
import Home from '@/pages/home';
import Markets from '@/pages/markets';
import MarketDetail from '@/pages/market-detail';
import Leaderboard from '@/pages/leaderboard';
import Profile from '@/pages/profile';
import Admin from '@/pages/admin';
import Auth from '@/pages/auth';
import NotFound from '@/pages/not-found';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

/** Renders children only for authenticated admins; redirects everyone else. */
function AdminRoute() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { data: authEnvelope, isLoading: meLoading } = useGetCurrentAuthUser({
    query: { enabled: isAuthenticated, queryKey: getGetCurrentAuthUserQueryKey() },
  });

  if (authLoading || (isAuthenticated && meLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Checking access…
      </div>
    );
  }

  if (!isAuthenticated) {
    // Kick unauthenticated users to login
    login();
    return null;
  }

  if (!authEnvelope?.user?.isAdmin) {
    // Authenticated but not an admin — send to home
    return <Redirect to="/" />;
  }

  return <Admin />;
}

function Router() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/markets" component={Markets} />
          <Route path="/markets/:id" component={MarketDetail} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/profile/:id" component={Profile} />
          <Route path="/admin" component={AdminRoute} />
          <Route path="/auth" component={Auth} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
