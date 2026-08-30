"use client";

import Link from "next/link";
import { useSignUp } from "@clerk/nextjs";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CodeInput, FieldMessage, FormAlert, PasswordInput, SubmitButton } from "./auth-controls";
import { clerkErrorMessage, restrictedModeFromClerkError, safeRedirect, ssoCallbackUrl } from "./auth-utils";
import { LegalConsent } from "./legal-consent";
import { SocialConnections, type SocialConnection } from "./social-connections";

const SUPPORTED_SSO_FIELDS = new Set(["email_address", "first_name", "last_name", "legal_accepted"]);
type SignUpStage = "account_details" | "email_verification" | "missing_requirements";

export function SignUpForm({ redirectUrl, ssoContinuation = false }: { redirectUrl: string; ssoContinuation?: boolean }) {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const resumedSso = useRef(false);
  const [continuingSso] = useState(ssoContinuation);
  const [stage, setStage] = useState<SignUpStage>(ssoContinuation ? "missing_requirements" : "account_details");
  const [ssoBusy, setSsoBusy] = useState<SocialConnection["strategy"] | null>(null);
  const [email, setEmail] = useState(signUp.emailAddress ?? "");
  const [firstName, setFirstName] = useState(signUp.firstName ?? "");
  const [lastName, setLastName] = useState(signUp.lastName ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState("");
  const [blockedMode, setBlockedMode] = useState<"restricted" | "waitlist" | null>(null);
  const busy = fetchStatus === "fetching" || ssoBusy !== null;
  const missingFields = signUp.missingFields;
  const completingRequirements = stage === "missing_requirements";
  const showFirstName = completingRequirements ? missingFields.includes("first_name") : signUp.requiredFields.includes("first_name") || signUp.optionalFields.includes("first_name");
  const showLastName = completingRequirements ? missingFields.includes("last_name") : signUp.requiredFields.includes("last_name") || signUp.optionalFields.includes("last_name");
  const showEmail = !completingRequirements || missingFields.includes("email_address");
  const requiresLegal = signUp.requiredFields.includes("legal_accepted") || missingFields.includes("legal_accepted");
  const signInHref = redirectUrl === "/" ? "/sign-in" : `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`;

  const finish = useCallback(async () => {
    const { error } = await signUp.finalize({
      navigate: ({ decorateUrl }) => {
        router.replace(safeRedirect(decorateUrl(redirectUrl)));
      },
    });
    if (error) setLocalError(clerkErrorMessage(error));
  }, [redirectUrl, router, signUp]);

  useEffect(() => {
    if (!continuingSso || resumedSso.current) return;
    resumedSso.current = true;

    queueMicrotask(() => {
      if (signUp.status === "complete") {
        void finish();
        return;
      }

      const unsupported = missingFields.filter((field: string) => !SUPPORTED_SSO_FIELDS.has(field));
      const unsupportedVerification = signUp.unverifiedFields.filter((field) => field !== "email_address");
      if (unsupported.length || unsupportedVerification.length) {
        setLocalError("This account needs information or verification that this form does not support. Return to sign up and try another method.");
        return;
      }

      if (missingFields.length === 0 && signUp.unverifiedFields.includes("email_address")) {
        void signUp.verifications.sendEmailCode().then(({ error }) => {
          if (error) setLocalError(clerkErrorMessage(error));
          else setStage("email_verification");
        });
      } else if (missingFields.length === 0) {
        setLocalError("Social sign-up could not be resumed. Return to sign up and try again.");
      }
    });
  }, [continuingSso, finish, missingFields, signUp]);

  async function handleSocial(connection: SocialConnection) {
    setLocalError("");
    setBlockedMode(null);
    setSsoBusy(connection.strategy);
    const { error } = await signUp.sso({
      strategy: connection.strategy,
      redirectUrl: safeRedirect(redirectUrl),
      redirectCallbackUrl: ssoCallbackUrl("sign-up", redirectUrl),
    });
    if (error) {
      setBlockedMode(restrictedModeFromClerkError(error));
      setLocalError(clerkErrorMessage(error, `We couldn't connect to ${connection.name}.`));
      setSsoBusy(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    setBlockedMode(null);
    if (password !== confirmPassword) return setLocalError("Those passwords do not match.");
    if (requiresLegal && !acceptedTerms) return setLocalError("Please accept the account terms to continue.");

    const { error } = await signUp.password({
      emailAddress: email,
      password,
      ...(showFirstName && firstName ? { firstName } : {}),
      ...(showLastName && lastName ? { lastName } : {}),
      ...(requiresLegal ? { legalAccepted: acceptedTerms } : {}),
    });
    if (error) {
      setBlockedMode(restrictedModeFromClerkError(error));
      return setLocalError(clerkErrorMessage(error, "We couldn't create your account."));
    }
    if (signUp.status === "complete") return finish();

    if (signUp.unverifiedFields.includes("email_address")) {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return setLocalError(clerkErrorMessage(sent.error));
      setCode("");
      setStage("email_verification");
      return;
    }
    setLocalError("Your account needs an additional sign-up step that is not available here.");
  }

  async function handleRequirementsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (requiresLegal && !acceptedTerms) return setLocalError("Please accept the account terms to continue.");

    const { error } = await signUp.update({
      ...(missingFields.includes("email_address") ? { emailAddress: email } : {}),
      ...(missingFields.includes("first_name") ? { firstName } : {}),
      ...(missingFields.includes("last_name") ? { lastName } : {}),
      ...(requiresLegal ? { legalAccepted: acceptedTerms } : {}),
    });
    if (error) return setLocalError(clerkErrorMessage(error, "We couldn't complete your account."));
    if (signUp.status === "complete") return finish();

    if (signUp.unverifiedFields.includes("email_address")) {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return setLocalError(clerkErrorMessage(sent.error));
      setCode("");
      setStage("email_verification");
      return;
    }

    const unsupported = signUp.missingFields.filter((field) => !SUPPORTED_SSO_FIELDS.has(field));
    setLocalError(unsupported.length
      ? "This account needs information that this form does not support. Return to sign up and try another method."
      : "Your account still needs more information. Review the required fields and try again.");
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) return setLocalError(clerkErrorMessage(error, "That verification code is not valid."));
    if (signUp.status === "complete") return finish();
    if (signUp.status === "missing_requirements") {
      const unsupported = signUp.missingFields.filter((field) => !SUPPORTED_SSO_FIELDS.has(field));
      if (!unsupported.length && signUp.missingFields.length) {
        setAcceptedTerms(false);
        setStage("missing_requirements");
        return;
      }
    }
    setLocalError("Your email is verified, but your account still needs information that this form does not support.");
  }

  async function goBack() {
    setLocalError("");
    setCode("");
    if (continuingSso) {
      setStage("missing_requirements");
      return;
    }
    await signUp.reset();
    setStage("account_details");
  }

  async function resendCode() {
    setLocalError("");
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) setLocalError(clerkErrorMessage(error));
  }

  const globalError = errors.global?.[0]?.longMessage ?? errors.global?.[0]?.message;

  if (stage === "email_verification") {
    return (
      <>
        <button type="button" onClick={goBack} className="mb-5 flex items-center gap-1.5 text-sm font-bold muted hover:text-[var(--foreground)]"><ArrowLeft size={15} /> {continuingSso ? "Back to account details" : "Change email"}</button>
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
      {stage === "account_details" && !continuingSso ? <SocialConnections busy={busy} connecting={ssoBusy} onConnect={handleSocial} /> : null}
      {completingRequirements && !continuingSso ? <div className="mb-6"><h2 className="text-xl font-black">Complete your account</h2><p className="mt-2 text-sm leading-6 muted">Your email is verified. Complete the remaining account requirements to join.</p></div> : null}
      <FormAlert>{localError || globalError}</FormAlert>
      {blockedMode && <p className="mb-5 text-sm leading-6 muted">{blockedMode === "waitlist" ? <>Teich is currently using a waitlist. <Link href="/waitlist" className="font-extrabold" style={{ color: "var(--brand)" }}>Join the waitlist</Link> to request access.</> : "Use the secure link in your invitation email to create your account."}</p>}
      <form onSubmit={completingRequirements ? handleRequirementsSubmit : handleSubmit} noValidate>
        {(showFirstName || showLastName) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {showFirstName && <div><label htmlFor="first-name" className="label">First name</label><input id="first-name" name="firstName" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className={`input ${errors.fields.firstName ? "!border-[var(--danger)]" : ""}`} required={continuingSso || signUp.requiredFields.includes("first_name")} aria-invalid={Boolean(errors.fields.firstName)} aria-describedby={errors.fields.firstName ? "first-name-error" : undefined} /><FieldMessage id="first-name-error">{errors.fields.firstName?.longMessage ?? errors.fields.firstName?.message}</FieldMessage></div>}
            {showLastName && <div><label htmlFor="last-name" className="label">Last name</label><input id="last-name" name="lastName" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className={`input ${errors.fields.lastName ? "!border-[var(--danger)]" : ""}`} required={continuingSso || signUp.requiredFields.includes("last_name")} aria-invalid={Boolean(errors.fields.lastName)} aria-describedby={errors.fields.lastName ? "last-name-error" : undefined} /><FieldMessage id="last-name-error">{errors.fields.lastName?.longMessage ?? errors.fields.lastName?.message}</FieldMessage></div>}
          </div>
        )}
        {showEmail && <div className={showFirstName || showLastName ? "mt-5" : ""}>
          <label htmlFor="email" className="label">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`input ${errors.fields.emailAddress ? "!border-[var(--danger)]" : ""}`} placeholder="you@example.com" required aria-invalid={Boolean(errors.fields.emailAddress)} aria-describedby={errors.fields.emailAddress ? "email-error" : undefined} />
          <FieldMessage id="email-error">{errors.fields.emailAddress?.longMessage ?? errors.fields.emailAddress?.message}</FieldMessage>
        </div>}
        {!completingRequirements && <div className="mt-5">
          <label htmlFor="password" className="label">Password</label>
          <PasswordInput id="password" name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required error={errors.fields.password?.longMessage ?? errors.fields.password?.message} aria-describedby={errors.fields.password ? "password-error" : undefined} />
          <FieldMessage id="password-error">{errors.fields.password?.longMessage ?? errors.fields.password?.message}</FieldMessage>
        </div>}
        {!completingRequirements && <div className="mt-5">
          <label htmlFor="confirm-password" className="label">Confirm password</label>
          <PasswordInput id="confirm-password" name="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" minLength={8} required error={confirmPassword && password !== confirmPassword ? "Passwords do not match" : undefined} aria-describedby={confirmPassword && password !== confirmPassword ? "confirm-password-error" : undefined} />
          <FieldMessage id="confirm-password-error">{confirmPassword && password !== confirmPassword ? "Passwords do not match." : undefined}</FieldMessage>
        </div>}
        {requiresLegal && <LegalConsent checked={acceptedTerms} onChange={setAcceptedTerms} />}
        {stage === "account_details" ? <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" className="mt-4" /> : null}
        <SubmitButton busy={busy} busyLabel={completingRequirements ? "Completing account…" : "Creating account…"}>{completingRequirements ? "Complete account" : "Create account"}</SubmitButton>
      </form>
      <p className="mt-7 text-center text-sm muted">Already a member? <Link href={signInHref} className="font-extrabold" style={{ color: "var(--brand)" }}>Sign in</Link></p>
    </>
  );
}
