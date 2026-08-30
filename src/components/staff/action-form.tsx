"use client";

import { useActionState } from "react";
import type { StaffActionState } from "@/actions/staff";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";

const initialState: StaffActionState = { status: "idle" };

export function StaffActionForm({
  action,
  children,
  className = "space-y-3",
}: {
  action: (state: StaffActionState, formData: FormData) => Promise<StaffActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const rateState = state.status === "rate_limited" ? state : null;
  const { coolingDown, onReady } = useRateLimitCooldown(rateState);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      <fieldset disabled={pending || coolingDown} className="contents">{children}</fieldset>
      {state.message ? (
        <p
          className="text-xs font-semibold"
          style={{ color: state.status === "success" ? "var(--brand-dark)" : "var(--danger)" }}
          role={state.status === "success" ? "status" : "alert"}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
      {rateState ? <RateLimitCountdown trigger={rateState} onReady={onReady} className="text-xs font-semibold" /> : null}
    </form>
  );
}
