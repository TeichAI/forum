"use client";

import Link from "next/link";
import { useWaitlist } from "@clerk/nextjs";
import { MailCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { FieldMessage, FormAlert, SubmitButton } from "./auth-controls";
import { clerkErrorMessage } from "./auth-utils";

export function WaitlistForm() {
  const { waitlist, errors, fetchStatus } = useWaitlist();
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState("");
  const busy = fetchStatus === "fetching";
  const globalError = errors.global?.[0]?.longMessage ?? errors.global?.[0]?.message;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const { error } = await waitlist.join({ emailAddress: email.trim() });
    if (error) setLocalError(clerkErrorMessage(error, "We couldn't add you to the waitlist."));
  }

  if (waitlist.id) {
    return (
      <div role="status" className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
          <MailCheck aria-hidden="true" size={25} />
        </div>
        <h2 className="mt-5 text-xl font-black">You’re on the waitlist</h2>
        <p className="mt-2 text-sm leading-6 muted">We’ll email you when your invitation is ready. Use that secure link to finish creating your account.</p>
        <Link href="/" className="button button-secondary mt-7 w-full !py-3">Return to the forum</Link>
      </div>
    );
  }

  return (
    <>
      <FormAlert>{localError || globalError}</FormAlert>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="waitlist-email" className="label">Email address</label>
        <input
          id="waitlist-email"
          name="emailAddress"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`input ${errors.fields.emailAddress ? "!border-[var(--danger)]" : ""}`}
          placeholder="you@example.com"
          required
          aria-invalid={Boolean(errors.fields.emailAddress)}
          aria-describedby={errors.fields.emailAddress ? "waitlist-email-error" : undefined}
        />
        <FieldMessage id="waitlist-email-error">{errors.fields.emailAddress?.longMessage ?? errors.fields.emailAddress?.message}</FieldMessage>
        <SubmitButton busy={busy} busyLabel="Joining…">Join the waitlist</SubmitButton>
      </form>
      <p className="mt-7 text-center text-sm muted">Already have access? <Link href="/sign-in" className="font-extrabold" style={{ color: "var(--brand)" }}>Sign in</Link></p>
    </>
  );
}
