import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MultiChoiceCard } from './multi-choice-card';

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
// Minimal market fixture (OPEN, MULTI_CHOICE)
// ---------------------------------------------------------------------------

const CONTENDERS = [
  { key: 'A', name: 'Alpha' },
  { key: 'B', name: 'Beta' },
  { key: 'C', name: 'Gamma' },
];

const BASE_MARKET = {
  id: 1,
  question: 'Who wins the Buzz Battle?',
  status: 'OPEN',
  category: 'MUSIC',
  totalPredictions: 0,
  description: JSON.stringify({ contenders: CONTENDERS }),
  resolvedOutcome: null,
} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTally(tallies: Record<string, number>) {
  return { data: { tallies } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MultiChoiceCard — tally polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseGetMarketTally.mockReturnValue(makeTally({ A: 10, B: 5, C: 2 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders initial vote counts from the first tally response', () => {
    render(<MultiChoiceCard market={BASE_MARKET} />);

    // Alpha has 10 / 17 ≈ 59 %, Beta 5/17 ≈ 29 %, Gamma 2/17 ≈ 12 %
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('passes refetchInterval=30000 to useGetMarketTally for an OPEN market', () => {
    render(<MultiChoiceCard market={BASE_MARKET} />);

    const [, options] = mockUseGetMarketTally.mock.calls[0] as [unknown, { query: { refetchInterval: number | false } }];
    expect(options.query.refetchInterval).toBe(30_000);
  });

  it('re-renders with updated counts after a second user votes (simulated refetch)', () => {
    const { rerender } = render(<MultiChoiceCard market={BASE_MARKET} />);

    // Verify initial render shows first tally
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    // Simulate the poll firing: the hook now returns updated tallies
    mockUseGetMarketTally.mockReturnValue(makeTally({ A: 12, B: 8, C: 3 }));

    // Advance fake timers past the 30 s interval, then force a re-render
    // (in the real app React Query triggers the rerender; here we do it manually
    //  after advancing the clock to confirm the interval is correct)
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    rerender(<MultiChoiceCard market={BASE_MARKET} />);

    // Updated counts should now appear
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Old counts should no longer appear
    expect(screen.queryByText('10')).not.toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('updates the leading contender highlight after the vote shift', () => {
    const { rerender } = render(<MultiChoiceCard market={BASE_MARKET} />);

    // Initially Alpha leads (10 votes)
    const alphaInitial = screen.getByText('Alpha');
    expect(alphaInitial.className).toContain('text-primary');

    // After refetch Beta overtakes Alpha
    mockUseGetMarketTally.mockReturnValue(makeTally({ A: 5, B: 20, C: 3 }));
    act(() => { vi.advanceTimersByTime(30_000); });
    rerender(<MultiChoiceCard market={BASE_MARKET} />);

    const betaEl = screen.getByText('Beta');
    expect(betaEl.className).toContain('text-primary');
  });

  it('updates the total vote count footer after refetch', () => {
    const { rerender } = render(<MultiChoiceCard market={BASE_MARKET} />);

    // Initial total: 10+5+2 = 17
    expect(screen.getByText(/17 total votes/i)).toBeInTheDocument();

    // After second user votes: 12+8+3 = 23
    mockUseGetMarketTally.mockReturnValue(makeTally({ A: 12, B: 8, C: 3 }));
    act(() => { vi.advanceTimersByTime(30_000); });
    rerender(<MultiChoiceCard market={BASE_MARKET} />);

    expect(screen.getByText(/23 total votes/i)).toBeInTheDocument();
  });

  it('passes refetchInterval=false for a RESOLVED market (stops polling)', () => {
    const resolvedMarket = {
      ...BASE_MARKET,
      status: 'RESOLVED',
      resolvedOutcome: 'A',
    };

    render(<MultiChoiceCard market={resolvedMarket} />);

    const [, options] = mockUseGetMarketTally.mock.calls[0] as [unknown, { query: { refetchInterval: number | false } }];
    expect(options.query.refetchInterval).toBe(false);
  });

  it('passes refetchInterval=false for a CLOSED market (stops polling)', () => {
    const closedMarket = { ...BASE_MARKET, status: 'CLOSED' };

    render(<MultiChoiceCard market={closedMarket} />);

    const [, options] = mockUseGetMarketTally.mock.calls[0] as [unknown, { query: { refetchInterval: number | false } }];
    expect(options.query.refetchInterval).toBe(false);
  });
});
