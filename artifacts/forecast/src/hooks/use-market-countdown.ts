import { useState, useEffect, useCallback } from "react";

function formatCountdown(msLeft: number): string {
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

export function useMarketCountdown(market: {
  clockType?: string | null;
  expireAt?: string | null;
}): { label: string | null; urgent: boolean } {
  const clockType = market?.clockType as string | undefined;
  const expireAt = market?.expireAt as string | null | undefined;

  const compute = useCallback(() => {
    if (!clockType || clockType === "EVERGREEN") return { label: null, urgent: false };
    if (clockType === "RECURRING_PULSE") return { label: "Recurring monthly", urgent: false };
    if (!expireAt) return { label: null, urgent: false };

    const msLeft = new Date(expireAt).getTime() - Date.now();
    if (msLeft <= 0) return { label: "Closing soon", urgent: true };

    return { label: formatCountdown(msLeft), urgent: msLeft < 60 * 60 * 1000 };
  }, [clockType, expireAt]);

  const [state, setState] = useState(compute);

  useEffect(() => {
    if (!clockType || clockType === "EVERGREEN" || clockType === "RECURRING_PULSE" || !expireAt) {
      setState(compute());
      return;
    }
    setState(compute());
    const id = setInterval(() => setState(compute()), 1000);
    return () => clearInterval(id);
  }, [clockType, expireAt, compute]);

  return state;
}
