"use client";

import { createContext, forwardRef, useActionState, useContext, useEffect } from "react";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";
import type { RateLimitedActionState } from "@/lib/rate-limit";

export type ActionResult = RateLimitedActionState | { status: string; message?: string; replyId?: string } | void;
type FormState = Exclude<ActionResult, void> | { status: "idle" };

const RateLimitFormContext = createContext({ coolingDown: false });

export function useRateLimitFormStatus() {
  return useContext(RateLimitFormContext);
}

export const RateLimitForm = forwardRef<HTMLFormElement, Omit<React.ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<ActionResult>;
  onSuccess?: (result: Exclude<ActionResult, void>) => void;
}>(function RateLimitForm({ action, children, onSuccess, ...props }, ref) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (_previous, formData) => {
    return await action(formData) ?? { status: "idle" };
  }, { status: "idle" });
  const rateState = state.status === "rate_limited" && "resetAt" in state ? state : null;
  const resetAt = rateState?.resetAt;
  const { coolingDown, onReady } = useRateLimitCooldown(resetAt);

  useEffect(() => {
    if (state.status === "success") onSuccess?.(state);
  }, [onSuccess, state]);

  return (
    <RateLimitFormContext.Provider value={{ coolingDown }}>
      <form {...props} ref={ref} action={formAction} aria-busy={pending}>
        {children}
        {rateState ? (
          <div className="mt-3 space-y-1 text-sm" style={{ color: "var(--danger)" }} role="alert">
            <p className="font-semibold">{rateState.message}</p>
            <RateLimitCountdown resetAt={rateState.resetAt} onReady={onReady} />
          </div>
        ) : null}
      </form>
    </RateLimitFormContext.Provider>
  );
});
