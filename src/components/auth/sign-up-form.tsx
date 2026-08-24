"use client";

import Link from "next/link";
import { useSignUp } from "@clerk/nextjs";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CodeInput, FieldMessage, FormAlert, PasswordInput, SubmitButton } from "./auth-controls";
import { clerkErrorMessage, safeRedirect } from "./auth-utils";

export function SignUpForm({ redirectUrl }: { redirectUrl: string }) {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState("");
  const busy = fetchStatus === "fetching";
  const showFirstName = signUp.requiredFields.includes("first_name") || signUp.optionalFields.includes("first_name");
  const showLastName = signUp.requiredFields.includes("last_name") || signUp.optionalFields.includes("last_name");
  const requiresLegal = signUp.requiredFields.includes("legal_accepted");
  const signInHref = redirectUrl === "/" ? "/sign-in" : `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`;

  async function finish() {
    const { error } = await signUp.finalize({
      navigate: ({ decorateUrl }) => {
        router.replace(safeRedirect(decorateUrl(redirectUrl)));
      },
    });
    if (error) setLocalError(clerkErrorMessage(error));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (password !== confirmPassword) return setLocalError("Those passwords do not match.");
    if (requiresLegal && !acceptedTerms) return setLocalError("Please accept the account terms to continue.");

    const { error } = await signUp.password({
      emailAddress: email,
      password,
      ...(showFirstName && firstName ? { firstName } : {}),
      ...(showLastName && lastName ? { lastName } : {}),
      ...(requiresLegal ? { legalAccepted: acceptedTerms } : {}),
    });
    if (error) return setLocalError(clerkErrorMessage(error, "We couldn't create your account."));
    if (signUp.status === "complete") return finish();

    if (signUp.unverifiedFields.includes("email_address")) {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return setLocalError(clerkErrorMessage(sent.error));
      setCode("");
      setVerifying(true);
      return;
    }
    setLocalError("Your account needs an additional sign-up step that is not available here.");
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) return setLocalError(clerkErrorMessage(error, "That verification code is not valid."));
    if (signUp.status === "complete") await finish();
    else setLocalError("Your email is verified, but your account still needs more information.");
  }

  async function goBack() {
    setLocalError("");
    setCode("");
    await signUp.reset();
    setVerifying(false);
  }

  async function resendCode() {
    setLocalError("");
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) setLocalError(clerkErrorMessage(error));
  }

  const globalError = errors.global?.[0]?.longMessage ?? errors.global?.[0]?.message;

  if (verifying) {
    return (
      <>
        <button type="button" onClick={goBack} className="mb-5 flex items-center gap-1.5 text-sm font-bold muted hover:text-[var(--foreground)]"><ArrowLeft size={15} /> Change email</button>
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><MailCheck size={22} /></div>
        <h2 className="text-xl font-black">Check your inbox</h2>
        <p className="mb-6 mt-2 text-sm leading-6 muted">We sent a 6-digit verification code to <strong className="text-[var(--foreground)]">{email}</strong>.</p>
        <FormAlert>{localError || globalError}</FormAlert>
        <form onSubmit={verifyEmail}>
          <label htmlFor="code" className="label">Verification code</label>
          <CodeInput id="code" name="code" value={code} onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))} required autoFocus aria-invalid={Boolean(errors.fields.code)} aria-describedby={errors.fields.code ? "code-error" : undefined} />
          <FieldMessage id="code-error">{errors.fields.code?.longMessage ?? errors.fields.code?.message}</FieldMessage>
          <SubmitButton busy={busy} busyLabel="Verifying…">Verify and join</SubmitButton>
        </form>
        <button type="button" disabled={busy} onClick={resendCode} className="mt-4 w-full text-center text-xs font-bold muted hover:text-[var(--brand)]">Didn’t get it? Send another code</button>
      </>
    );
  }

  return (
    <>
      <FormAlert>{localError || globalError}</FormAlert>
      <form onSubmit={handleSubmit} noValidate>
        {(showFirstName || showLastName) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {showFirstName && <div><label htmlFor="first-name" className="label">First name</label><input id="first-name" name="firstName" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className={`input ${errors.fields.firstName ? "!border-[var(--danger)]" : ""}`} required={signUp.requiredFields.includes("first_name")} aria-invalid={Boolean(errors.fields.firstName)} aria-describedby={errors.fields.firstName ? "first-name-error" : undefined} /><FieldMessage id="first-name-error">{errors.fields.firstName?.longMessage ?? errors.fields.firstName?.message}</FieldMessage></div>}
            {showLastName && <div><label htmlFor="last-name" className="label">Last name</label><input id="last-name" name="lastName" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className={`input ${errors.fields.lastName ? "!border-[var(--danger)]" : ""}`} required={signUp.requiredFields.includes("last_name")} aria-invalid={Boolean(errors.fields.lastName)} aria-describedby={errors.fields.lastName ? "last-name-error" : undefined} /><FieldMessage id="last-name-error">{errors.fields.lastName?.longMessage ?? errors.fields.lastName?.message}</FieldMessage></div>}
          </div>
        )}
        <div className={showFirstName || showLastName ? "mt-5" : ""}>
          <label htmlFor="email" className="label">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`input ${errors.fields.emailAddress ? "!border-[var(--danger)]" : ""}`} placeholder="you@example.com" required aria-invalid={Boolean(errors.fields.emailAddress)} aria-describedby={errors.fields.emailAddress ? "email-error" : undefined} />
          <FieldMessage id="email-error">{errors.fields.emailAddress?.longMessage ?? errors.fields.emailAddress?.message}</FieldMessage>
        </div>
        <div className="mt-5">
          <label htmlFor="password" className="label">Password</label>
          <PasswordInput id="password" name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required error={errors.fields.password?.longMessage ?? errors.fields.password?.message} aria-describedby={errors.fields.password ? "password-error" : undefined} />
          <FieldMessage id="password-error">{errors.fields.password?.longMessage ?? errors.fields.password?.message}</FieldMessage>
        </div>
        <div className="mt-5">
          <label htmlFor="confirm-password" className="label">Confirm password</label>
          <PasswordInput id="confirm-password" name="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" minLength={8} required error={confirmPassword && password !== confirmPassword ? "Passwords do not match" : undefined} aria-describedby={confirmPassword && password !== confirmPassword ? "confirm-password-error" : undefined} />
          <FieldMessage id="confirm-password-error">{confirmPassword && password !== confirmPassword ? "Passwords do not match." : undefined}</FieldMessage>
        </div>
        {requiresLegal && <label className="mt-5 flex items-start gap-2.5 text-xs leading-5 muted"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required className="mt-1 accent-[var(--brand)]" />I agree to the Teich community guidelines and account terms.</label>}
        <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" className="mt-4" />
        <SubmitButton busy={busy} busyLabel="Creating account…">Create account</SubmitButton>
      </form>
      <p className="mt-7 text-center text-sm muted">Already a member? <Link href={signInHref} className="font-extrabold" style={{ color: "var(--brand)" }}>Sign in</Link></p>
    </>
  );
}
