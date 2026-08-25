"use client";

import type { SpacePostingPolicy } from "@prisma/client";
import { useActionState, useId, useState } from "react";
import { updateSpacePostingPolicy, type SpacePolicyActionState } from "@/actions/spaces";
import { FieldMessage } from "@/components/auth/auth-controls";
import { SPACE_POSTING_POLICY_OPTIONS } from "@/components/forum/space-posting-policy";
import { SubmitButton } from "@/components/ui/submit-button";

type SpacePostingPolicyFormProps = {
  category: {
    id: string;
    name: string;
    description: string;
    color: string;
    postingPolicy: SpacePostingPolicy;
  };
};

const initialState = { status: "idle" } satisfies SpacePolicyActionState;

export function SpacePostingPolicyForm({ category }: SpacePostingPolicyFormProps) {
  const [state, action] = useActionState(updateSpacePostingPolicy, initialState);
  const [selectedPolicy, setSelectedPolicy] = useState(category.postingPolicy);
  const selectId = useId();
  const messageId = useId();
  const selectedDetails = SPACE_POSTING_POLICY_OPTIONS.find((option) => option.value === selectedPolicy)!;

  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`${selectId}-heading`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: category.color }} aria-hidden="true" />
            <h2 id={`${selectId}-heading`} className="truncate text-lg font-black">{category.name}</h2>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 muted">{category.description}</p>
        </div>

        <form action={action} className="w-full shrink-0 space-y-3 sm:w-80" noValidate>
          <input type="hidden" name="categoryId" value={category.id} />
          <div>
            <label className="label" htmlFor={selectId}>Posting permissions</label>
            <select
              className="input"
              id={selectId}
              name="postingPolicy"
              value={selectedPolicy}
              onChange={(event) => setSelectedPolicy(event.target.value as SpacePostingPolicy)}
              aria-invalid={Boolean(state.fieldErrors?.postingPolicy)}
              aria-describedby={state.fieldErrors?.postingPolicy ? `${selectId}-error` : `${selectId}-help`}
            >
              {SPACE_POSTING_POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p id={`${selectId}-help`} className="mt-1.5 text-xs leading-5 muted">{selectedDetails.description}</p>
            <FieldMessage id={`${selectId}-error`}>{state.fieldErrors?.postingPolicy}</FieldMessage>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div
              id={messageId}
              className="text-xs font-semibold"
              style={{ color: state.status === "error" ? "var(--danger)" : "var(--brand-dark)" }}
              role={state.status === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {state.message}
            </div>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </div>
        </form>
      </div>
    </section>
  );
}
