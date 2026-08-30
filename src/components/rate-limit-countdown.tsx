"use client";

import { useCallback, useEffect, useState } from "react";

export const CLIENT_RATE_LIMIT_COOLDOWN_SECONDS = 30;

export function useRateLimitCooldown(trigger?: object | null) {
  const [readyTrigger, setReadyTrigger] = useState<object | null>();
  const onReady = useCallback(() => setReadyTrigger(trigger), [trigger]);
  return {
    coolingDown: Boolean(trigger && readyTrigger !== trigger),
    onReady,
  };
}

export function RateLimitCountdown({
  trigger,
  className = "text-sm font-semibold",
  onReady,
  durationSeconds = CLIENT_RATE_LIMIT_COOLDOWN_SECONDS,
}: {
  trigger: object;
  className?: string;
  onReady?: () => void;
  durationSeconds?: number;
}) {
  const [countdown, setCountdown] = useState({ trigger, durationSeconds, remaining: durationSeconds });
  const remaining = countdown.trigger === trigger && countdown.durationSeconds === durationSeconds ? countdown.remaining : durationSeconds;

  useEffect(() => {
    let next = durationSeconds;
    const timer = window.setInterval(() => {
      next = Math.max(0, next - 1);
      setCountdown({ trigger, durationSeconds, remaining: next });
      if (next === 0) {
        window.clearInterval(timer);
        onReady?.();
      }
    }, 1_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [durationSeconds, onReady, trigger]);

  return (
    <span className={className} role="status" aria-live="polite">
      {remaining > 0 ? `Try again in ${remaining} second${remaining === 1 ? "" : "s"}.` : "You can try again now."}
    </span>
  );
}
