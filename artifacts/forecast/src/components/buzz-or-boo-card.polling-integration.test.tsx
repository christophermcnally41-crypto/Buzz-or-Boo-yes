/**
 * buzz-or-boo-card.polling-integration.test.tsx
 *
 * Integration tests that verify BuzzOrBooCard's tally-polling behaviour
 * using a REAL QueryClient + real useGetMarketTally hook.  The underlying
 * HTTP layer is intercepted by spying on globalThis.fetch, so the React
 * Query refetch machinery runs end-to-end:
 *
 *   mount → queryFn → fetch #1 → render bars
 *   ↓ refetchInterval elapses
 *   queryFn → fetch #2 → re-render bars with updated counts
 *
 * getTallyRefetchInterval is mocked to return 50 ms instead of 30 000 ms
 * so the interval fires quickly in real-time without needing fake timers.
 *
 * Contrast with buzz-or-boo-card.test.tsx, which mocks useGetMarketTally
 * entirely and therefore cannot verify that the refetchInterval wiring
 * actually drives re-fetches.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BuzzOrBooCard } from './buzz-or-boo-card';

// ---------------------------------------------------------------------------
// Speed up the poll interval so tests don't need to wait 30 s.
// For OPEN markets we return 50 ms; all other statuses retain false so
// the "stops polling" tests work without any extra setup.
// ---------------------------------------------------------------------------

vi.mock('@/lib/tally-poll', () => ({
  getTallyRefetchInterval: (status: string) => (status === 'OPEN' ? 50 : false),
}));

// ---------------------------------------------------------------------------
// Lightweight mocks for unrelated dependencies
// ---------------------------------------------------------------------------

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('./countdown-badge', () => ({
  CountdownBadge: () => null,
}));

// ---------------------------------------------------------------------------
// Market fixture
// ---------------------------------------------------------------------------

const OPEN_MARKET = {
  id: 42,
  title: 'Taylor Swift at Coachella?',
  question: 'Taylor Swift at Coachella?',
  status: 'OPEN',
  category: 'MUSIC',
  marketFormat: 'BUZZ_OR_BOO',
  totalPredictions: 10,
  yesPercent: 50,
  noPercent: 50,
  resolvedOutcome: null,
  resolvedAt: null,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a QueryClient with retry disabled so failures surface immediately. */
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

/** Wrap the component with a dedicated, isolated QueryClientProvider. */
function renderCard(market: object, client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <BuzzOrBooCard market={market as any} />
    </QueryClientProvider>,
  );
}

/**
 * Install a fetch spy that returns responses from the given sequence in
 * order.  Once the sequence is exhausted the last entry is repeated.
 * Returns a counter getter so tests can assert the number of real HTTP
 * requests issued by the React Query machinery.
 */
function setupFetchSequence(responses: object[]): () => number {
  let callCount = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((): Promise<Response> => {
    const idx = Math.min(callCount, responses.length - 1);
    callCount++;
    return Promise.resolve(
      new Response(JSON.stringify(responses[idx]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  return () => callCount;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuzzOrBooCard — real React Query polling integration', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = makeClient();
  });

  afterEach(async () => {
    client.clear();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Two successive auto-poll responses update the bars
  // -------------------------------------------------------------------------

  it('re-renders ⚡/👎 bars after the refetch interval fires with an updated tally', async () => {
    const getCallCount = setupFetchSequence([
      { tallies: { YES: 60, NO: 40 } }, // fetch #1 — initial load
      { tallies: { YES: 80, NO: 20 } }, // fetch #2 — poll at 50 ms
    ]);

    renderCard(OPEN_MARKET, client);

    // First fetch resolves: 60 BUZZ / 40 BOO → 60% / 40%
    await waitFor(() => {
      expect(screen.getByText(/60% BUZZ/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/40% BOO/i)).toBeInTheDocument();
    expect(getCallCount()).toBe(1);

    // The 50 ms refetchInterval fires automatically — second fetch returns 80/20
    await waitFor(
      () => {
        expect(screen.getByText(/80% BUZZ/i)).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    expect(screen.getByText(/20% BOO/i)).toBeInTheDocument();

    // Old percentages must be gone
    expect(screen.queryByText(/60% BUZZ/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/40% BOO/i)).not.toBeInTheDocument();

    // Confirm the React Query machinery issued a genuine second request
    expect(getCallCount()).toBe(2);
  });

  it('displays updated raw ⚡ and 👎 vote counts after a poll returns new tallies', async () => {
    const getCallCount = setupFetchSequence([
      { tallies: { YES: 120, NO: 80 } }, // fetch #1
      { tallies: { YES: 150, NO: 50 } }, // fetch #2
    ]);

    renderCard(OPEN_MARKET, client);

    // Initial raw counts
    await waitFor(() => {
      expect(screen.getByText('120 BUZZ')).toBeInTheDocument();
    });
    expect(screen.getByText('80 BOO')).toBeInTheDocument();

    // After the automatic refetch the counts update
    await waitFor(
      () => {
        expect(screen.getByText('150 BUZZ')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    expect(screen.getByText('50 BOO')).toBeInTheDocument();

    // Old raw counts are gone
    expect(screen.queryByText('120 BUZZ')).not.toBeInTheDocument();
    expect(screen.queryByText('80 BOO')).not.toBeInTheDocument();

    expect(getCallCount()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Polling stops when the market is no longer OPEN
  // -------------------------------------------------------------------------

  it('fires only the initial fetch for a RESOLVED market — no further auto-poll', async () => {
    const getCallCount = setupFetchSequence([{ tallies: { YES: 80, NO: 20 } }]);

    const resolvedMarket = {
      ...OPEN_MARKET,
      status: 'RESOLVED',
      resolvedOutcome: 'YES',
    };

    renderCard(resolvedMarket, client);

    // Wait for the initial query to complete
    await waitFor(() => expect(getCallCount()).toBeGreaterThan(0));
    const countAfterMount = getCallCount();

    // Wait well beyond the (mocked) OPEN interval — no additional fetch should fire
    await new Promise((r) => setTimeout(r, 200));
    expect(getCallCount()).toBe(countAfterMount);
  });

  it('fires only the initial fetch for a CLOSED market — no further auto-poll', async () => {
    const getCallCount = setupFetchSequence([{ tallies: { YES: 60, NO: 40 } }]);

    const closedMarket = { ...OPEN_MARKET, status: 'CLOSED' };
    renderCard(closedMarket, client);

    await waitFor(() => expect(getCallCount()).toBeGreaterThan(0));
    const countAfterMount = getCallCount();

    await new Promise((r) => setTimeout(r, 200));
    expect(getCallCount()).toBe(countAfterMount);
  });

  // -------------------------------------------------------------------------
  // OPEN → RESOLVED transition stops the polling mid-flight
  // -------------------------------------------------------------------------

  it('stops issuing new tally fetches once the market transitions from OPEN to RESOLVED', async () => {
    const getCallCount = setupFetchSequence([
      { tallies: { YES: 60, NO: 40 } }, // fetch #1 — initial while OPEN
      { tallies: { YES: 70, NO: 30 } }, // fetch #2 — first poll while still OPEN
      // Any further fetches after the market becomes RESOLVED would be a bug
      { tallies: { YES: 99, NO: 1 } },
    ]);

    const { rerender } = renderCard(OPEN_MARKET, client);

    // Let the first refetch fire (market is OPEN, interval = 50 ms)
    await waitFor(() => expect(getCallCount()).toBe(2), { timeout: 1000 });

    // Market resolves — re-render with the terminal status
    const resolvedMarket = {
      ...OPEN_MARKET,
      status: 'RESOLVED',
      resolvedOutcome: 'YES',
    };
    rerender(
      <QueryClientProvider client={client}>
        <BuzzOrBooCard market={resolvedMarket as any} />
      </QueryClientProvider>,
    );

    const countAfterResolve = getCallCount();

    // Wait several times the (mocked) interval — the count must not grow
    await new Promise((r) => setTimeout(r, 200));
    expect(getCallCount()).toBe(countAfterResolve);
  });
});
