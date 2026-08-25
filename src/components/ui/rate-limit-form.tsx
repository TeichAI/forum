"use client";

import { createContext, forwardRef, useActionState, useContext } from "react";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";
import type { RateLimitedActionState } from "@/lib/rate-limit";

type ActionResult = RateLimitedActionState | void;
type FormState = RateLimitedActionState | { status: "idle" };

const RateLimitFormContext = createContext({ coolingDown: false });

export function useRateLimitFormStatus() {
  return useContext(RateLimitFormContext);
}

export const RateLimitForm = forwardRef<HTMLFormElement, Omit<React.ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<ActionResult>;
}>(function RateLimitForm({ action, children, ...props }, ref) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (_previous, formData) => {
    return await action(formData) ?? { status: "idle" };
  }, { status: "idle" });
  const resetAt = state.status === "rate_limited" ? state.resetAt : undefined;
  const { coolingDown, onReady } = useRateLimitCooldown(resetAt);

  return (
    <RateLimitFormContext.Provider value={{ coolingDown }}>
      <form {...props} ref={ref} action={formAction} aria-busy={pending}>
        {children}
        {state.status === "rate_limited" ? (
          <div className="mt-3 space-y-1 text-sm" style={{ color: "var(--danger)" }} role="alert">
            <p className="font-semibold">{state.message}</p>
            <RateLimitCountdown resetAt={state.resetAt} onReady={onReady} />
          </div>
        ) : null}
      </form>
    </RateLimitFormContext.Provider>
  );
});
