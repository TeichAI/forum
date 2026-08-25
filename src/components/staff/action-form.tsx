"use client";

import { useActionState } from "react";
import type { StaffActionState } from "@/actions/staff";

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
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {state.message ? (
        <p
          className="text-xs font-semibold"
          style={{ color: state.status === "error" ? "var(--danger)" : "var(--brand-dark)" }}
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
