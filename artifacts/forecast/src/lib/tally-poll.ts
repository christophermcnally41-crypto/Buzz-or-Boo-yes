/**
 * Returns the React Query refetchInterval for tally polling.
 *
 * Polling is only meaningful while the market is accepting new votes.
 * Once a market moves to RESOLVED or CLOSED the tally is frozen and
 * further requests would be wasted — so we return `false` to stop polling.
 *
 * @param status - The market's current status string (e.g. "OPEN", "RESOLVED", "CLOSED")
 * @returns 30_000 ms when status is "OPEN", false otherwise
 */
export function getTallyRefetchInterval(status: string): number | false {
  return status === "OPEN" ? 30_000 : false;
}
