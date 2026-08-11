import { describe, it, expect } from 'vitest';
import { formatCountdown, computeCountdownState } from './market-countdown';

// ---------------------------------------------------------------------------
// formatCountdown
// ---------------------------------------------------------------------------

describe('formatCountdown', () => {
  it('shows seconds when under 1 minute', () => {
    expect(formatCountdown(45_000)).toBe('Closes in 45s');
    expect(formatCountdown(1_000)).toBe('Closes in 1s');
  });

  it('shows minutes + seconds when under 1 hour', () => {
    expect(formatCountdown(5 * 60_000 + 30_000)).toBe('Closes in 5m 30s');
    expect(formatCountdown(59 * 60_000 + 59_000)).toBe('Closes in 59m 59s');
  });

  it('shows hours + minutes when under 1 day', () => {
    expect(formatCountdown(3 * 3_600_000 + 20 * 60_000)).toBe('Closes in 3h 20m');
  });

  it('shows days + hours when between 1 and 6 days', () => {
    expect(formatCountdown(2 * 86_400_000 + 5 * 3_600_000)).toBe('Closes in 2d 5h');
  });

  it('shows days only when 7 or more days remain', () => {
    expect(formatCountdown(7 * 86_400_000)).toBe('Closes in 7d');
    expect(formatCountdown(30 * 86_400_000)).toBe('Closes in 30d');
  });
});

// ---------------------------------------------------------------------------
// computeCountdownState — the core freeze-at-zero behaviour
// ---------------------------------------------------------------------------

describe('computeCountdownState', () => {
  const NOW = Date.now();

  // --- Expired markets ---

  it('returns "Closing soon" and urgent=true when expireAt is in the past', () => {
    const expireAt = new Date(NOW - 1_000).toISOString(); // 1 second ago
    const result = computeCountdownState('SCHEDULED', expireAt, NOW);
    expect(result.label).toBe('Closing soon');
    expect(result.urgent).toBe(true);
  });

  it('returns "Closing soon" and urgent=true when expireAt equals now (msLeft = 0)', () => {
    const expireAt = new Date(NOW).toISOString();
    const result = computeCountdownState('SCHEDULED', expireAt, NOW);
    expect(result.label).toBe('Closing soon');
    expect(result.urgent).toBe(true);
  });

  it('returns "Closing soon" and urgent=true even when the market expired a long time ago', () => {
    const expireAt = new Date(NOW - 7 * 86_400_000).toISOString(); // 7 days ago
    const result = computeCountdownState('SCHEDULED', expireAt, NOW);
    expect(result.label).toBe('Closing soon');
    expect(result.urgent).toBe(true);
  });

  it('never returns a negative label string', () => {
    const expireAt = new Date(NOW - 5_000).toISOString(); // 5 seconds ago
    const { label } = computeCountdownState('SCHEDULED', expireAt, NOW);
    // label must be the frozen string, not something like "Closes in -5s"
    expect(label).not.toMatch(/-/);
    expect(label).toBe('Closing soon');
  });

  // --- Active markets ---

  it('returns a countdown label when expireAt is in the future', () => {
    const expireAt = new Date(NOW + 2 * 60_000).toISOString(); // 2 minutes from now
    const { label, urgent } = computeCountdownState('SCHEDULED', expireAt, NOW);
    expect(label).toMatch(/^Closes in/);
    expect(urgent).toBe(true); // < 1 hour → urgent
  });

  it('is not urgent when more than 1 hour remains', () => {
    const expireAt = new Date(NOW + 2 * 3_600_000).toISOString(); // 2 hours
    const { urgent } = computeCountdownState('SCHEDULED', expireAt, NOW);
    expect(urgent).toBe(false);
  });

  // --- Special clock types ---

  it('returns null label for EVERGREEN markets', () => {
    const { label } = computeCountdownState('EVERGREEN', null, NOW);
    expect(label).toBeNull();
  });

  it('returns null label when clockType is missing', () => {
    const { label } = computeCountdownState(undefined, null, NOW);
    expect(label).toBeNull();
  });

  it('returns "Recurring monthly" for RECURRING_PULSE markets', () => {
    const { label, urgent } = computeCountdownState('RECURRING_PULSE', null, NOW);
    expect(label).toBe('Recurring monthly');
    expect(urgent).toBe(false);
  });

  it('returns null label when expireAt is missing', () => {
    const { label } = computeCountdownState('SCHEDULED', null, NOW);
    expect(label).toBeNull();
  });

  // --- Simulation: repeated ticks after expiry ---

  it('continues to show "Closing soon" on every subsequent tick after expiry', () => {
    const expireAt = new Date(NOW - 500).toISOString(); // just expired
    // Simulate 5 more 1-second ticks
    for (let i = 1; i <= 5; i++) {
      const { label, urgent } = computeCountdownState('SCHEDULED', expireAt, NOW + i * 1_000);
      expect(label).toBe('Closing soon');
      expect(urgent).toBe(true);
    }
  });
});
