import { describe, it, expect } from 'vitest';
import { getTallyRefetchInterval } from './tally-poll';

describe('getTallyRefetchInterval', () => {
  it('returns 30_000 ms when the market is OPEN', () => {
    expect(getTallyRefetchInterval('OPEN')).toBe(30_000);
  });

  it('returns false when the market is RESOLVED so polling stops', () => {
    expect(getTallyRefetchInterval('RESOLVED')).toBe(false);
  });

  it('returns false when the market is CLOSED so polling stops', () => {
    expect(getTallyRefetchInterval('CLOSED')).toBe(false);
  });

  it('returns false for any other status (DRAFT, PENDING, etc.)', () => {
    expect(getTallyRefetchInterval('DRAFT')).toBe(false);
    expect(getTallyRefetchInterval('PENDING')).toBe(false);
    expect(getTallyRefetchInterval('')).toBe(false);
  });
});
