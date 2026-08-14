/**
 * market-detail-buzz.test.tsx
 *
 * Confirms that on the market detail page:
 *  1. The tally query uses refetchInterval=30_000 when the market is OPEN
 *     and refetchInterval=false when it is RESOLVED.
 *  2. After a BUZZ_OR_BOO prediction is posted, the tally query key is
 *     invalidated so the bars reflect the latest distribution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MarketDetail from './market-detail';

// ---------------------------------------------------------------------------
// Shared spy — tracks every invalidateQueries call
// ---------------------------------------------------------------------------

const mockInvalidateQueries = vi.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };

// ---------------------------------------------------------------------------
// API hook mocks
// ---------------------------------------------------------------------------

const mockUseGetMarketTally = vi.fn();
const mockUseMakePrediction = vi.fn();

// Callback captured from the mutation so tests can fire onSuccess/onError
let capturedOnSuccess: (() => void) | null = null;
let capturedOnError: ((e: unknown) => void) | null = null;

// ---------------------------------------------------------------------------
// BUZZ_OR_BOO market fixture — mutated per-test where necessary
// ---------------------------------------------------------------------------

const BUZZ_MARKET: Record<string, unknown> = {
  id: 42,
  title: 'Taylor Swift at Coachella?',
  question: 'Taylor Swift at Coachella?',
  status: 'OPEN',
  category: 'MUSIC',
  marketFormat: 'BUZZ_OR_BOO',
  totalPredictions: 100,
  yesPercent: 60,
  noPercent: 40,
  yesCount: 60,
  noCount: 40,
  resolvedOutcome: null,
  resolvedAt: null,
  clockType: 'EVERGREEN',
  expireAt: null,
  imageUrl: null,
  subcategory: null,
  description: null,
  resolutionSource: null,
  sourcePrimary: null,
  sourceBackup: null,
  baselineSnapshot: null,
  formula: null,
  voidRule: null,
  geo: null,
};

// ---------------------------------------------------------------------------
// @workspace/api-client-react — full mock
// ---------------------------------------------------------------------------

vi.mock('@workspace/api-client-react', () => {
  const TALLY_KEY = (id: number) => ['market-tally', id];
  const MARKET_KEY = (id: number) => ['market', id];
  const PREDS_KEY = (id: number) => ['market-predictions', id];
  const ME_KEY = () => ['me'];
  const STATS_KEY = () => ['platform-stats'];
  const USER_PREDS_KEY = (uid: number) => ['user-predictions', uid];
  const PIN_STATUS_KEY = (id: number) => ['market-pin-status', id];
  const USER_PINS_KEY = (uid: number) => ['user-pins', uid];
  const LIST_KEY = () => ['markets'];

  return {
    useGetMarketTally: (...args: unknown[]) => mockUseGetMarketTally(...args),
    useMakePrediction: (...args: unknown[]) => mockUseMakePrediction(...args),
    useGetMarket: () => ({ data: BUZZ_MARKET, isLoading: false, error: null }),
    useGetMarketPredictions: () => ({ data: [], isError: false }),
    useGetMe: () => ({ data: { tokenBalance: 500, id: 1 } }),
    useGetMarketPinStatus: () => ({ data: { pinned: false }, refetch: vi.fn() }),
    usePinMarket: () => ({ mutate: vi.fn() }),
    useUnpinMarket: () => ({ mutate: vi.fn() }),
    useListMarkets: () => ({ data: { markets: [] }, isLoading: false }),

    getGetMarketTallyQueryKey: TALLY_KEY,
    getGetMarketQueryKey: MARKET_KEY,
    getGetMarketPredictionsQueryKey: PREDS_KEY,
    getGetMeQueryKey: ME_KEY,
    getGetPlatformStatsQueryKey: STATS_KEY,
    getGetUserPredictionsQueryKey: USER_PREDS_KEY,
    getGetMarketPinStatusQueryKey: PIN_STATUS_KEY,
    getGetUserPinsQueryKey: USER_PINS_KEY,
    getListMarketsQueryKey: LIST_KEY,
  };
});

// ---------------------------------------------------------------------------
// Router / auth / react-query / toast mocks
// ---------------------------------------------------------------------------

vi.mock('wouter', () => ({
  useParams: () => ({ id: '42' }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@workspace/replit-auth-web', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'TestUser' },
    isAuthenticated: true,
    login: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Lightweight component mocks — not under test here
// ---------------------------------------------------------------------------

vi.mock('@/components/category-icon', () => ({
  CategoryIcon: () => null,
}));

vi.mock('@/components/countdown-badge', () => ({
  CountdownBadge: () => null,
}));

vi.mock('@/components/market-card', () => ({
  MarketCard: () => null,
}));

// Stub every lucide icon via importOriginal (required by vitest export validation)
vi.mock('lucide-react', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const stub = () => <span />;
  const overrides: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    if (typeof actual[key] === 'function') overrides[key] = stub;
  }
  return { ...actual, ...overrides };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the clickable ⚡ BUZZ verdict button (not any badge/label). */
function getBuzzButton() {
  return screen.getByRole('button', { name: /⚡ BUZZ/i });
}

/** Returns the clickable 👎 BOO verdict button. */
function getBooButton() {
  return screen.getByRole('button', { name: /👎 BOO/i });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketDetail — BUZZ_OR_BOO tally liveness', () => {
  beforeEach(() => {
    // Reset market fixture to OPEN
    BUZZ_MARKET.status = 'OPEN';
    BUZZ_MARKET.resolvedOutcome = null;

    // Default tally: 60 BUZZ, 40 BOO
    mockUseGetMarketTally.mockReturnValue({
      data: { tallies: { YES: 60, NO: 40 } },
      isLoading: false,
    });

    // Capture both callbacks from the mutation
    capturedOnSuccess = null;
    capturedOnError = null;
    mockUseMakePrediction.mockReturnValue({
      mutate: (_data: unknown, cbs: { onSuccess: () => void; onError: (e: unknown) => void }) => {
        capturedOnSuccess = cbs.onSuccess;
        capturedOnError = cbs.onError;
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // refetchInterval configuration on the page-level tally query
  // -------------------------------------------------------------------------

  it('configures the tally query with refetchInterval=30_000 when the market is OPEN', () => {
    render(<MarketDetail />);

    // Find the page-level useGetMarketTally call for market id=42
    const pageCall = mockUseGetMarketTally.mock.calls.find(([id]: [unknown]) => id === 42);
    expect(pageCall).toBeDefined();

    const opts = pageCall![1] as { query: { refetchInterval: number | false } };
    // BUZZ_OR_BOO + OPEN → getTallyRefetchInterval("OPEN") = 30_000
    expect(opts.query.refetchInterval).toBe(30_000);
  });

  it('configures the tally query with refetchInterval=false when the market is RESOLVED', () => {
    BUZZ_MARKET.status = 'RESOLVED';
    BUZZ_MARKET.resolvedOutcome = 'YES';

    render(<MarketDetail />);

    const pageCall = mockUseGetMarketTally.mock.calls.find(([id]: [unknown]) => id === 42);
    expect(pageCall).toBeDefined();

    const opts = pageCall![1] as { query: { refetchInterval: number | false } };
    // BUZZ_OR_BOO + RESOLVED → getTallyRefetchInterval("RESOLVED") = false
    expect(opts.query.refetchInterval).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Tally key invalidation after a prediction is submitted
  // -------------------------------------------------------------------------

  it('invalidates the tally query key when a BUZZ prediction succeeds', async () => {
    render(<MarketDetail />);

    fireEvent.click(getBuzzButton());
    expect(capturedOnSuccess).not.toBeNull();

    // Fire the success callback inside act() so React can flush state updates
    await act(async () => {
      capturedOnSuccess!();
    });

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map(
      ([arg]: [{ queryKey: unknown[] }]) => arg.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(['market-tally', 42]);
  });

  it('invalidates the tally query key when a BOO prediction succeeds', async () => {
    render(<MarketDetail />);

    fireEvent.click(getBooButton());
    expect(capturedOnSuccess).not.toBeNull();

    await act(async () => {
      capturedOnSuccess!();
    });

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map(
      ([arg]: [{ queryKey: unknown[] }]) => arg.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(['market-tally', 42]);
  });

  it('does NOT invalidate the tally key when the prediction errors', async () => {
    render(<MarketDetail />);

    fireEvent.click(getBuzzButton());
    expect(capturedOnError).not.toBeNull();

    // Fire the error path — should trigger toast but not any invalidation
    await act(async () => {
      capturedOnError!({ response: { data: { error: 'Already voted' } } });
    });

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map(
      ([arg]: [{ queryKey: unknown[] }]) => arg.queryKey,
    );
    expect(invalidatedKeys).not.toContainEqual(['market-tally', 42]);
  });

  // -------------------------------------------------------------------------
  // Bars reflect updated distribution after verdict + refetch
  // -------------------------------------------------------------------------

  it('updates the live split bar percentages after a verdict triggers a tally refetch', async () => {
    const { rerender } = render(<MarketDetail />);

    // The mini-bar above the verdict buttons shows "⚡ 60%" and "40% 👎"
    // (there may be two instances — at least one must be present)
    expect(screen.getAllByText('⚡ 60%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('40% 👎').length).toBeGreaterThanOrEqual(1);

    // Submit a BUZZ vote
    fireEvent.click(getBuzzButton());
    expect(capturedOnSuccess).not.toBeNull();

    await act(async () => {
      capturedOnSuccess!();
    });

    // Simulate React Query refetching with updated tally after invalidation
    mockUseGetMarketTally.mockReturnValue({
      data: { tallies: { YES: 75, NO: 25 } },
      isLoading: false,
    });

    await waitFor(() => {
      rerender(<MarketDetail />);
      expect(screen.getAllByText('⚡ 75%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('25% 👎').length).toBeGreaterThanOrEqual(1);
    });

    // Old percentages must be gone
    expect(screen.queryByText('⚡ 60%')).not.toBeInTheDocument();
    expect(screen.queryByText('40% 👎')).not.toBeInTheDocument();
  });
});
