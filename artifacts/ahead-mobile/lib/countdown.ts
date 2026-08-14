/**
 * Compute a human-readable countdown label for a market card.
 *
 * Cards refresh when the list re-renders; they don't need a per-second interval.
 * Returns null when no countdown is relevant (EVERGREEN markets or no expiry set).
 */
export function getCountdownLabel(
  clockType: string | undefined,
  expireAt: string | null | undefined,
): { label: string; urgent: boolean } | null {
  if (!clockType || clockType === 'EVERGREEN') return null;
  if (clockType === 'RECURRING_PULSE') return { label: '🔁 Recurring', urgent: false };
  if (!expireAt) return null;

  const msLeft = new Date(expireAt).getTime() - Date.now();
  if (msLeft <= 0) return { label: 'Closing soon', urgent: true };

  const totalSecs = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hrs = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);

  let label: string;
  if (days >= 7) label = `${days}d left`;
  else if (days >= 1) label = `${days}d ${hrs}h left`;
  else if (hrs >= 1) label = `${hrs}h ${mins}m left`;
  else label = `${mins}m left`;

  return { label, urgent: msLeft < 60 * 60 * 1000 };
}
