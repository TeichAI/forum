"use client";

import Link from "next/link";
import { useSignIn, useSignUp } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CodeInput, FieldMessage, FormAlert, PasswordInput, SubmitButton } from "./auth-controls";
import { authFormUrl, clerkErrorMessage, safeRedirect } from "./auth-utils";

export type InvitationAccountStatus = "sign_in" | "sign_up";
type Step = "details" | "mfa";
type MfaStrategy = "email" | "phone" | "totp" | "backup";

const SUPPORTED_FIELDS = new Set(["first_name", "last_name", "password", "legal_accepted"]);

export function InvitationForm({ ticket, accountStatus, redirectUrl }: { ticket: string; accountStatus: InvitationAccountStatus; redirectUrl: string }) {
  const { signIn, errors: signInErrors, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetchStatus } = useSignUp();
  const router = useRouter();
  const started = useRef(false);
  const [step, setStep] = useState<Step>("details");
  const [firstName, setFirstName] = useState(signUp.firstName ?? "");
  const [lastName, setLastName] = useState(signUp.lastName ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [code, setCode] = useState("");
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy>("totp");
  const [localError, setLocalError] = useState("");
  const busy = signInFetchStatus === "fetching" || signUpFetchStatus === "fetching";
  const requiredFields = signUp.requiredFields;
  const optionalFields = signUp.optionalFields;
  const showFirstName = requiredFields.includes("first_name") || optionalFields.includes("first_name");
  const showLastName = requiredFields.includes("last_name") || optionalFields.includes("last_name");
  const showPassword = requiredFields.includes("password") || optionalFields.includes("password");
  const requiresLegal = requiredFields.includes("legal_accepted");

  const finishSignIn = useCallback(async () => {
    const { error } = await signIn.finalize({
      navigate: ({ decorateUrl }) => router.replace(safeRedirect(decorateUrl(redirectUrl))),
    });
    if (error) setLocalError(clerkErrorMessage(error));
  }, [redirectUrl, router, signIn]);

  const finishSignUp = useCallback(async () => {
    const { error } = await signUp.finalize({
      navigate: ({ decorateUrl }) => router.replace(safeRedirect(decorateUrl(redirectUrl))),
    });
    if (error) setLocalError(clerkErrorMessage(error));
  }, [redirectUrl, router, signUp]);

  const prepareMfa = useCallback(async () => {
    const strategies = signIn.supportedSecondFactors.map((factor) => factor.strategy);
    if (strategies.includes("email_code")) {
      setMfaStrategy("email");
      const { error } = await signIn.mfa.sendEmailCode();
      if (error) return setLocalError(clerkErrorMessage(error));
    } else if (strategies.includes("phone_code")) {
      setMfaStrategy("phone");
      const { error } = await signIn.mfa.sendPhoneCode();
      if (error) return setLocalError(clerkErrorMessage(error));
    } else if (strategies.includes("totp")) {
      setMfaStrategy("totp");
    } else if (strategies.includes("backup_code")) {
      setMfaStrategy("backup");
    } else {
      return setLocalError("This invited account requires a sign-in method this form does not support yet.");
    }
    setCode("");
    setStep("mfa");
  }, [signIn]);

  useEffect(() => {
    if (accountStatus !== "sign_in" || started.current) return;
    started.current = true;
    void (async () => {
      const { error } = await signIn.ticket({ ticket });
      if (error) return setLocalError(clerkErrorMessage(error, "This invitation is invalid or has expired."));
      if (signIn.status === "complete") return finishSignIn();
      if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") return prepareMfa();
      if (signIn.status === "needs_new_password") {
        router.replace(authFormUrl("sign-in", redirectUrl, true));
        return;
      }
      setLocalError("This invitation could not finish signing in. Return to sign in and try again.");
    })();
  }, [accountStatus, finishSignIn, prepareMfa, redirectUrl, router, signIn, ticket]);

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (showPassword && password !== confirmPassword) return setLocalError("Those passwords do not match.");
    if (requiresLegal && !acceptedTerms) return setLocalError("Please accept the account terms to continue.");

    const startedSignUp = await signUp.create({
      strategy: "ticket",
      ticket,
      ...(showFirstName && firstName ? { firstName } : {}),
      ...(showLastName && lastName ? { lastName } : {}),
      ...(showPassword && password ? { password } : {}),
      ...(requiresLegal ? { legalAccepted: acceptedTerms } : {}),
    });
    if (startedSignUp.error) return setLocalError(clerkErrorMessage(startedSignUp.error, "This invitation is invalid or has expired."));
    if (signUp.status === "complete") return finishSignUp();

    const unsupported = signUp.missingFields.filter((field) => !SUPPORTED_FIELDS.has(field));
    if (unsupported.length || signUp.unverifiedFields.length) {
      setLocalError("This invitation requires account information or verification that this form does not support.");
    } else {
      setLocalError("Your invitation was accepted, but your account still needs more information.");
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const normalized = code.replace(/\s/g, "");
    const result = mfaStrategy === "email"
      ? await signIn.mfa.verifyEmailCode({ code: normalized })
      : mfaStrategy === "phone"
        ? await signIn.mfa.verifyPhoneCode({ code: normalized })
        : mfaStrategy === "totp"
          ? await signIn.mfa.verifyTOTP({ code: normalized })
          : await signIn.mfa.verifyBackupCode({ code: normalized });
    if (result.error) return setLocalError(clerkErrorMessage(result.error, "That verification code is not valid."));
    if (signIn.status === "complete") return finishSignIn();
    setLocalError("Your invitation was accepted, but sign-in still needs more information.");
  }

  if (accountStatus === "sign_in" && step !== "mfa") {
    return (
      <div aria-busy={!localError}>
        <FormAlert>{localError}</FormAlert>
        {localError ? (
          <Link href={authFormUrl("sign-in", redirectUrl)} className="button button-primary w-full !py-3">Return to sign in</Link>
        ) : (
          <div role="status" className="flex items-center gap-3 rounded-xl border px-4 py-4 text-sm font-bold" style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}>
            <LoaderCircle aria-hidden="true" className="animate-spin" size={19} /> Accepting your invitation…
          </div>
        )}
      </div>
    );
  }

  if (step === "mfa") {
    const backup = mfaStrategy === "backup";
    return (
      <>
        <h2 className="text-xl font-black">One more step</h2>
        <p className="mb-6 mt-2 text-sm leading-6 muted">Enter the {mfaStrategy === "totp" ? "code from your authenticator" : backup ? "backup code" : "code sent to your account"}.</p>
        <FormAlert>{localError || (signInErrors.global?.[0]?.longMessage ?? signInErrors.global?.[0]?.message)}</FormAlert>
        <form onSubmit={verifyMfa}>
          <label htmlFor="invitation-mfa-code" className="label">Verification code</label>
          <CodeInput id="invitation-mfa-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode={backup ? "text" : "numeric"} maxLength={backup ? 64 : 6} required autoFocus />
          <SubmitButton busy={busy} busyLabel="Verifying…">Verify invitation</SubmitButton>
        </form>
      </>
    );
  }

  const globalError = signUpErrors.global?.[0]?.longMessage ?? signUpErrors.global?.[0]?.message;
  return (
    <>
      <FormAlert>{localError || globalError}</FormAlert>
      <form onSubmit={handleSignUp} noValidate>
        {(showFirstName || showLastName) && <div className="grid gap-4 sm:grid-cols-2">
          {showFirstName && <div><label htmlFor="invitation-first-name" className="label">First name</label><input id="invitation-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className={`input ${signUpErrors.fields.firstName ? "!border-[var(--danger)]" : ""}`} required={requiredFields.includes("first_name")} aria-invalid={Boolean(signUpErrors.fields.firstName)} aria-describedby={signUpErrors.fields.firstName ? "invitation-first-name-error" : undefined} /><FieldMessage id="invitation-first-name-error">{signUpErrors.fields.firstName?.longMessage ?? signUpErrors.fields.firstName?.message}</FieldMessage></div>}
          {showLastName && <div><label htmlFor="invitation-last-name" className="label">Last name</label><input id="invitation-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className={`input ${signUpErrors.fields.lastName ? "!border-[var(--danger)]" : ""}`} required={requiredFields.includes("last_name")} aria-invalid={Boolean(signUpErrors.fields.lastName)} aria-describedby={signUpErrors.fields.lastName ? "invitation-last-name-error" : undefined} /><FieldMessage id="invitation-last-name-error">{signUpErrors.fields.lastName?.longMessage ?? signUpErrors.fields.lastName?.message}</FieldMessage></div>}
        </div>}
        {showPassword && <div className={showFirstName || showLastName ? "mt-5" : ""}><label htmlFor="invitation-password" className="label">Password</label><PasswordInput id="invitation-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required={requiredFields.includes("password")} error={signUpErrors.fields.password?.longMessage ?? signUpErrors.fields.password?.message} aria-describedby={signUpErrors.fields.password ? "invitation-password-error" : undefined} /><FieldMessage id="invitation-password-error">{signUpErrors.fields.password?.longMessage ?? signUpErrors.fields.password?.message}</FieldMessage></div>}
        {showPassword && <div className="mt-5"><label htmlFor="invitation-confirm-password" className="label">Confirm password</label><PasswordInput id="invitation-confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required={requiredFields.includes("password")} error={confirmPassword && password !== confirmPassword ? "Passwords do not match" : undefined} aria-describedby={confirmPassword && password !== confirmPassword ? "invitation-confirm-password-error" : undefined} /><FieldMessage id="invitation-confirm-password-error">{confirmPassword && password !== confirmPassword ? "Passwords do not match." : undefined}</FieldMessage></div>}
        {requiresLegal && <label className="mt-5 flex items-start gap-2.5 text-xs leading-5 muted"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required className="mt-1 accent-[var(--brand)]" />I agree to the Teich community guidelines and account terms.</label>}
        <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" className="mt-4" />
        <SubmitButton busy={busy} busyLabel="Accepting…">Accept invitation</SubmitButton>
      </form>
      <p className="mt-7 text-center text-sm muted">Already joined? <Link href={authFormUrl("sign-in", redirectUrl)} className="font-extrabold" style={{ color: "var(--brand)" }}>Sign in</Link></p>
    </>
  );
}
