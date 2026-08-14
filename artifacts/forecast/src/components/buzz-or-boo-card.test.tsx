import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BuzzOrBooCard } from './buzz-or-boo-card';

// ---------------------------------------------------------------------------
// Mock @workspace/api-client-react so we control tally data without a server.
// ---------------------------------------------------------------------------

const mockUseGetMarketTally = vi.fn();

vi.mock('@workspace/api-client-react', () => ({
  useGetMarketTally: (...args: unknown[]) => mockUseGetMarketTally(...args),
  getGetMarketTallyQueryKey: (id: number) => ['market-tally', id],
}));

// ---------------------------------------------------------------------------
// Mock wouter <Link> to avoid router context requirement.
// ---------------------------------------------------------------------------

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Mock CountdownBadge — not under test here.
// ---------------------------------------------------------------------------

vi.mock('./countdown-badge', () => ({
  CountdownBadge: () => null,
}));

// ---------------------------------------------------------------------------
// Minimal market fixture (OPEN, BUZZ_OR_BOO)
// ---------------------------------------------------------------------------

const BASE_MARKET = {
  id: 42,
  title: 'Taylor Swift at Coachella 2026?',
  question: 'Taylor Swift at Coachella 2026?',
  status: 'OPEN',
  category: 'MUSIC',
  marketFormat: 'BUZZ_OR_BOO',
  totalPredictions: 100,
  yesPercent: 60,
  noPercent: 40,
  resolvedOutcome: null,
  resolvedAt: null,
} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTally(yes: number, no: number) {
  return { data: { tallies: { YES: yes, NO: no } } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuzzOrBooCard — tally polling and live bars', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseGetMarketTally.mockReturnValue(makeTally(60, 40));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // refetchInterval configuration
  // -------------------------------------------------------------------------

  it('passes refetchInterval=30_000 to useGetMarketTally for an OPEN market', () => {
    render(<BuzzOrBooCard market={BASE_MARKET} />);

    const [, options] = mockUseGetMarketTally.mock.calls[0] as [
      unknown,
      { query: { refetchInterval: number | false } },
    ];
    expect(options.query.refetchInterval).toBe(30_000);
  });

  it('passes refetchInterval=false for a RESOLVED market so polling stops', () => {
    const resolvedMarket = {
      ...BASE_MARKET,
      status: 'RESOLVED',
      resolvedOutcome: 'YES',
    };

    render(<BuzzOrBooCard market={resolvedMarket} />);

    const [, options] = mockUseGetMarketTally.mock.calls[0] as [
      unknown,
      { query: { refetchInterval: number | false } },
    ];
    expect(options.query.refetchInterval).toBe(false);
  });

  it('passes refetchInterval=false for a CLOSED market so polling stops', () => {
    const closedMarket = { ...BASE_MARKET, status: 'CLOSED' };

    render(<BuzzOrBooCard market={closedMarket} />);

    const [, options] = mockUseGetMarketTally.mock.calls[0] as [
      unknown,
      { query: { refetchInterval: number | false } },
    ];
    expect(options.query.refetchInterval).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Bar rendering from live tally
  // -------------------------------------------------------------------------

  it('renders initial BUZZ/BOO percentages from the first tally response', () => {
    // 60 BUZZ, 40 BOO → 60% / 40%
    render(<BuzzOrBooCard market={BASE_MARKET} />);

    expect(screen.getByText(/60% BUZZ/i)).toBeInTheDocument();
    expect(screen.getByText(/40% BOO/i)).toBeInTheDocument();
  });

  it('updates BUZZ/BOO percentages after the tally refetches with new counts', () => {
    const { rerender } = render(<BuzzOrBooCard market={BASE_MARKET} />);

    // Initial: 60 BUZZ, 40 BOO → 60% / 40%
    expect(screen.getByText(/60% BUZZ/i)).toBeInTheDocument();
    expect(screen.getByText(/40% BOO/i)).toBeInTheDocument();

    // Simulate poll firing: a fresh wave of BOO votes flips the balance
    mockUseGetMarketTally.mockReturnValue(makeTally(30, 70));

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    rerender(<BuzzOrBooCard market={BASE_MARKET} />);

    // Now BOO leads: 30/(30+70)*100 = 30% BUZZ, 70% BOO
    expect(screen.getByText(/30% BUZZ/i)).toBeInTheDocument();
    expect(screen.getByText(/70% BOO/i)).toBeInTheDocument();

    // Old percentages must be gone
    expect(screen.queryByText(/60% BUZZ/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/40% BOO/i)).not.toBeInTheDocument();
  });

  it('renders individual BUZZ and BOO vote counts from the live tally', () => {
    mockUseGetMarketTally.mockReturnValue(makeTally(120, 80));
    render(<BuzzOrBooCard market={BASE_MARKET} />);

    // The card footer shows raw counts: "120 BUZZ" and "80 BOO"
    expect(screen.getByText('120 BUZZ')).toBeInTheDocument();
    expect(screen.getByText('80 BOO')).toBeInTheDocument();
  });

  it('shows dominant-sentiment badge from live tally — BOO when BOO > BUZZ', () => {
    mockUseGetMarketTally.mockReturnValue(makeTally(30, 70));
    render(<BuzzOrBooCard market={BASE_MARKET} />);

    expect(screen.getByText(/BOO'D/i)).toBeInTheDocument();
    expect(screen.queryByText(/BUZZING/i)).not.toBeInTheDocument();
  });

  it('shows BUZZING badge when BUZZ leads in the live tally', () => {
    mockUseGetMarketTally.mockReturnValue(makeTally(80, 20));
    render(<BuzzOrBooCard market={BASE_MARKET} />);

    expect(screen.getByText(/BUZZING/i)).toBeInTheDocument();
    expect(screen.queryByText(/BOO'D/i)).not.toBeInTheDocument();
  });
});
