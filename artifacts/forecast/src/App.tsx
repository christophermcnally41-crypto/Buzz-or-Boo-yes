import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { Layout } from '@/components/layout';

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
          <Route path="/admin" component={Admin} />
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
