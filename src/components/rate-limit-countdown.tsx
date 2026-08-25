"use client";

import { useCallback, useEffect, useState } from "react";

function secondsUntil(resetAt: string) {
  return Math.max(0, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1_000));
}

export function useRateLimitCooldown(resetAt?: string) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!resetAt) return;
    const timer = window.setInterval(() => setTick((current) => current + 1), 250);
    return () => window.clearInterval(timer);
  }, [resetAt]);
  const onReady = useCallback(() => setTick((current) => current + 1), []);
  return {
    coolingDown: Boolean(resetAt && secondsUntil(resetAt) > 0),
    onReady,
  };
}

export function RateLimitCountdown({
  resetAt,
  className = "text-sm font-semibold",
  onReady,
}: {
  resetAt: string;
  className?: string;
  onReady?: () => void;
}) {
  const [remaining, setRemaining] = useState(() => secondsUntil(resetAt));

  useEffect(() => {
    const firstUpdate = window.setTimeout(() => setRemaining(secondsUntil(resetAt)), 0);
    const timer = window.setInterval(() => {
      const next = secondsUntil(resetAt);
      setRemaining(next);
      if (next === 0) {
        window.clearInterval(timer);
        onReady?.();
      }
    }, 250);
    return () => {
      window.clearTimeout(firstUpdate);
      window.clearInterval(timer);
    };
  }, [onReady, resetAt]);

  return (
    <span className={className} role="status" aria-live="polite">
      {remaining > 0 ? `Try again in ${remaining} second${remaining === 1 ? "" : "s"}.` : "You can try again now."}
    </span>
  );
}
