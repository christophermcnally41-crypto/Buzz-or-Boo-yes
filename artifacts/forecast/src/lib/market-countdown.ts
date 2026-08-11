// ---------------------------------------------------------------------------
// Pure countdown helpers — extracted so they can be unit-tested without React
// ---------------------------------------------------------------------------

export interface CountdownState {
  /** Human-readable label, or null when no countdown applies */
  label: string | null;
  /** True when fewer than 60 minutes remain (or the market has already expired) */
  urgent: boolean;
}

/**
 * Format a positive millisecond duration into a short human-readable string.
 * Callers must guarantee msLeft > 0.
 */
export function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days >= 7) return `Closes in ${days}d`;
  if (days >= 1) return `Closes in ${days}d ${hours}h`;
  if (hours >= 1) return `Closes in ${hours}h ${minutes}m`;
  if (minutes >= 1) return `Closes in ${minutes}m ${seconds}s`;
  return `Closes in ${seconds}s`;
}

/**
 * Compute the current countdown state given a clock type, an ISO expiry
 * timestamp, and the current epoch-ms timestamp.
 *
 * Rules:
 *  - EVERGREEN / missing clockType  → no label
 *  - RECURRING_PULSE                → static "Recurring monthly"
 *  - missing expireAt               → no label
 *  - expireAt in the past (msLeft ≤ 0) → "Closing soon", urgent=true
 *    (the result is frozen; it never decrements further)
 *  - expireAt in the future         → formatted countdown, urgent when < 1 h
 */
export function computeCountdownState(
  clockType: string | undefined,
  expireAt: string | null | undefined,
  now: number,
): CountdownState {
  if (!clockType || clockType === "EVERGREEN") {
    return { label: null, urgent: false };
  }
  if (clockType === "RECURRING_PULSE") {
    return { label: "Recurring monthly", urgent: false };
  }
  if (!expireAt) {
    return { label: null, urgent: false };
  }

  const msLeft = new Date(expireAt).getTime() - now;

  // Freeze here — never show a negative countdown.
  if (msLeft <= 0) {
    return { label: "Closing soon", urgent: true };
  }

  return {
    label: formatCountdown(msLeft),
    urgent: msLeft < 60 * 60 * 1000,
  };
}
