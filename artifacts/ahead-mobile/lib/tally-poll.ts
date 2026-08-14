/**
 * Returns the React Query refetchInterval for tally polling.
 * Returns 30_000 ms when the market is OPEN, false otherwise.
 */
export function getTallyRefetchInterval(status: string): number | false {
  return status === 'OPEN' ? 30_000 : false;
}
