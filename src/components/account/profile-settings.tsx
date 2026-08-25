"use client";

import { useActionState } from "react";
import { updateAccountProfile, type AccountActionState } from "@/actions/account";
import { FieldMessage } from "@/components/auth/auth-controls";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";
import { SubmitButton } from "@/components/ui/submit-button";

type ProfileSettingsProps = {
  displayName: string;
  username: string;
  bio: string;
};

export function ProfileSettings({ displayName, username, bio }: ProfileSettingsProps) {
  const [state, action] = useActionState(updateAccountProfile, { status: "idle" } satisfies AccountActionState);
  const resetAt = state.status === "rate_limited" ? state.resetAt : undefined;
  const { coolingDown, onReady } = useRateLimitCooldown(resetAt);

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="profile-settings-heading">
      <div className="mb-6">
        <h2 id="profile-settings-heading" className="text-xl font-black">Forum profile</h2>
        <p className="mt-1 text-sm muted">Choose how your name and biography appear to other members.</p>
      </div>
      {state.message && (
        <div
          className="mb-5 rounded-xl border px-3.5 py-3 text-sm"
          style={{
            borderColor: state.status === "success" ? "color-mix(in srgb, var(--brand) 30%, var(--line))" : "color-mix(in srgb, var(--danger) 28%, var(--line))",
            background: state.status === "success" ? "var(--brand-soft)" : "color-mix(in srgb, var(--danger) 8%, var(--surface))",
            color: state.status === "success" ? "var(--brand-dark)" : "var(--danger)",
          }}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
          {resetAt ? <div className="mt-1"><RateLimitCountdown resetAt={resetAt} onReady={onReady} /></div> : null}
        </div>
      )}
      <form action={action} className="space-y-5" noValidate>
        <fieldset disabled={coolingDown} className="contents">
        <div>
          <label className="label" htmlFor="displayName">Display name</label>
          <input className="input" id="displayName" name="displayName" defaultValue={displayName} minLength={1} maxLength={60} required aria-invalid={Boolean(state.fieldErrors?.displayName)} aria-describedby={state.fieldErrors?.displayName ? "display-name-error" : undefined} />
          <FieldMessage id="display-name-error">{state.fieldErrors?.displayName}</FieldMessage>
        </div>
        <div>
          <label className="label" htmlFor="username">Username</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 muted" aria-hidden="true">@</span>
            <input className="input !pl-8" id="username" name="username" defaultValue={username} pattern="[a-z0-9_]{3,30}" required aria-invalid={Boolean(state.fieldErrors?.username)} aria-describedby={state.fieldErrors?.username ? "username-error" : "username-help"} />
          </div>
          <p id="username-help" className="mt-1 text-xs muted">3–30 lowercase letters, numbers, or underscores.</p>
          <FieldMessage id="username-error">{state.fieldErrors?.username}</FieldMessage>
        </div>
        <div>
          <label className="label" htmlFor="bio">Bio</label>
          <textarea className="input" id="bio" name="bio" defaultValue={bio} rows={5} maxLength={500} aria-invalid={Boolean(state.fieldErrors?.bio)} aria-describedby={state.fieldErrors?.bio ? "bio-error" : undefined} />
          <FieldMessage id="bio-error">{state.fieldErrors?.bio}</FieldMessage>
        </div>
        <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save profile</SubmitButton></div>
        </fieldset>
      </form>
    </section>
  );
}
