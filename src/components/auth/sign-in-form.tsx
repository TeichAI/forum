"use client";

import Link from "next/link";
import { useSignIn } from "@clerk/nextjs";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CodeInput, FieldMessage, FormAlert, PasswordInput, SubmitButton } from "./auth-controls";
import { clerkErrorMessage, safeRedirect, ssoCallbackUrl } from "./auth-utils";
import { SocialConnections, type SocialConnection } from "./social-connections";
import type { ClerkAccessMode } from "@/lib/access-mode";

type Step = "password" | "forgot-code" | "new-password" | "mfa";
type MfaStrategy = "email" | "phone" | "totp" | "backup";

export function SignInForm({ redirectUrl, ssoContinuation = false, accessMode = "public" }: { redirectUrl: string; ssoContinuation?: boolean; accessMode?: ClerkAccessMode }) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const resumedSso = useRef(false);
  const [step, setStep] = useState<Step>("password");
  const [continuingSso, setContinuingSso] = useState(ssoContinuation);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy>("totp");
  const [localError, setLocalError] = useState("");
  const busy = fetchStatus === "fetching" || ssoBusy;
  const signUpHref = accessMode === "waitlist"
    ? "/waitlist"
    : redirectUrl === "/" ? "/sign-up" : `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`;

  const finish = useCallback(async () => {
    const { error } = await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        router.replace(safeRedirect(decorateUrl(redirectUrl)));
      },
    });
    if (error) setLocalError(clerkErrorMessage(error));
  }, [redirectUrl, router, signIn]);

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
      return setLocalError("This account requires a sign-in method this form does not support yet.");
    }
    setCode("");
    setStep("mfa");
  }, [signIn]);

  useEffect(() => {
    if (!continuingSso || resumedSso.current) return;
    resumedSso.current = true;

    queueMicrotask(() => {
      if (signIn.status === "complete") {
        void finish();
      } else if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
        void prepareMfa();
      } else if (signIn.status === "needs_new_password") {
        setStep("new-password");
      } else {
        setLocalError("GitHub sign-in could not be resumed. Return to sign in and try again.");
      }
    });
  }, [continuingSso, finish, prepareMfa, signIn.status]);

  async function handleSocial(connection: SocialConnection) {
    setLocalError("");
    setSsoBusy(true);
    const { error } = await signIn.sso({
      strategy: connection.strategy,
      redirectUrl: safeRedirect(redirectUrl),
      redirectCallbackUrl: ssoCallbackUrl("sign-in", redirectUrl),
    });
    if (error) {
      setLocalError(clerkErrorMessage(error, `We couldn't connect to ${connection.name}.`));
      setSsoBusy(false);
    }
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return setLocalError(clerkErrorMessage(error, "We couldn't sign you in with those details."));
    if (signIn.status === "complete") return finish();
    if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") return prepareMfa();
    setLocalError("Your account needs an additional sign-in step that is not available here.");
  }

  async function startReset() {
    if (!email.trim()) return setLocalError("Enter your email address first, then choose “Forgot password?”.");
    setLocalError("");
    const created = await signIn.create({ identifier: email });
    if (created.error) return setLocalError(clerkErrorMessage(created.error));
    const sent = await signIn.resetPasswordEmailCode.sendCode();
    if (sent.error) return setLocalError(clerkErrorMessage(sent.error));
    setCode("");
    setStep("forgot-code");
  }

  async function verifyResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (error) return setLocalError(clerkErrorMessage(error, "That code is not valid."));
    if (signIn.status === "needs_new_password") setStep("new-password");
    else setLocalError("Your password reset needs an additional step that is not available here.");
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
    if (error) return setLocalError(clerkErrorMessage(error));
    if (signIn.status === "complete") await finish();
    else setLocalError("Your password was saved, but sign-in could not be completed.");
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const result = mfaStrategy === "email"
      ? await signIn.mfa.verifyEmailCode({ code })
      : mfaStrategy === "phone"
        ? await signIn.mfa.verifyPhoneCode({ code })
        : mfaStrategy === "backup"
          ? await signIn.mfa.verifyBackupCode({ code })
          : await signIn.mfa.verifyTOTP({ code });
    if (result.error) return setLocalError(clerkErrorMessage(result.error, "That code is not valid."));
    if (signIn.status === "complete") await finish();
    else setLocalError("That step succeeded, but sign-in still needs more information.");
  }

  async function goBack() {
    setLocalError("");
    setCode("");
    await signIn.reset();
    setContinuingSso(false);
    setStep("password");
  }

  const globalError = errors.global?.[0]?.longMessage ?? errors.global?.[0]?.message;

  if (step === "forgot-code" || step === "mfa") {
    const isReset = step === "forgot-code";
    return (
      <>
        <button type="button" onClick={goBack} className="mb-5 flex items-center gap-1.5 text-sm font-bold muted hover:text-[var(--foreground)]"><ArrowLeft size={15} /> Back to sign in</button>
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><MailCheck size={22} /></div>
        <h2 className="text-xl font-black">{isReset ? "Check your inbox" : "One more step"}</h2>
        <p className="mb-6 mt-2 text-sm leading-6 muted">
          {isReset ? <>We sent a 6-digit reset code to <strong className="text-[var(--foreground)]">{email}</strong>.</> : mfaStrategy === "totp" ? "Enter the code from your authenticator app." : mfaStrategy === "backup" ? "Enter one of your backup codes." : "Enter the 6-digit code we sent to your account."}
        </p>
        <FormAlert>{localError || globalError}</FormAlert>
        <form onSubmit={isReset ? verifyResetCode : verifyMfa}>
          <label htmlFor="code" className="label">Verification code</label>
          <CodeInput id="code" name="code" value={code} onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))} required autoFocus inputMode={!isReset && mfaStrategy === "backup" ? "text" : "numeric"} maxLength={!isReset && mfaStrategy === "backup" ? 64 : 6} aria-invalid={Boolean(errors.fields.code)} aria-describedby={errors.fields.code ? "code-error" : undefined} />
          <FieldMessage id="code-error">{errors.fields.code?.longMessage ?? errors.fields.code?.message}</FieldMessage>
          <SubmitButton busy={busy} busyLabel="Verifying…">Verify code</SubmitButton>
        </form>
      </>
    );
  }

  if (step === "new-password") {
    return (
      <>
        <button type="button" onClick={goBack} className="mb-5 flex items-center gap-1.5 text-sm font-bold muted hover:text-[var(--foreground)]"><ArrowLeft size={15} /> Back to sign in</button>
        <h2 className="text-xl font-black">Choose a new password</h2>
        <p className="mb-6 mt-2 text-sm leading-6 muted">Make it memorable, unique, and hard to guess.</p>
        <FormAlert>{localError || globalError}</FormAlert>
        <form onSubmit={saveNewPassword}>
          <label htmlFor="new-password" className="label">New password</label>
          <PasswordInput id="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" required error={errors.fields.password?.longMessage ?? errors.fields.password?.message} aria-describedby={errors.fields.password ? "new-password-error" : undefined} />
          <FieldMessage id="new-password-error">{errors.fields.password?.longMessage ?? errors.fields.password?.message}</FieldMessage>
          <SubmitButton busy={busy} busyLabel="Saving…">Save new password</SubmitButton>
        </form>
      </>
    );
  }

  return (
    <>
      {!continuingSso && <SocialConnections busy={busy} onConnect={handleSocial} />}
      <FormAlert>{localError || globalError}</FormAlert>
      <form onSubmit={handlePassword} noValidate>
        <div>
          <label htmlFor="email" className="label">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`input ${errors.fields.identifier ? "!border-[var(--danger)]" : ""}`} placeholder="you@example.com" required aria-invalid={Boolean(errors.fields.identifier)} aria-describedby={errors.fields.identifier ? "email-error" : undefined} />
          <FieldMessage id="email-error">{errors.fields.identifier?.longMessage ?? errors.fields.identifier?.message}</FieldMessage>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="label">Password</label>
            <button type="button" onClick={startReset} className="mb-[.42rem] text-xs font-bold" style={{ color: "var(--brand)" }}>Forgot password?</button>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required error={errors.fields.password?.longMessage ?? errors.fields.password?.message} aria-describedby={errors.fields.password ? "password-error" : undefined} />
          <FieldMessage id="password-error">{errors.fields.password?.longMessage ?? errors.fields.password?.message}</FieldMessage>
        </div>
        <SubmitButton busy={busy} busyLabel="Signing in…">Sign in</SubmitButton>
      </form>
      <p className="mt-7 text-center text-sm muted">
        {accessMode === "waitlist" ? <>Need access? <Link href={signUpHref} className="font-extrabold" style={{ color: "var(--brand)" }}>Join the waitlist</Link></>
          : accessMode === "restricted" ? <>Access is invitation only. <Link href={signUpHref} className="font-extrabold" style={{ color: "var(--brand)" }}>Learn more</Link></>
            : <>New to Teich? <Link href={signUpHref} className="font-extrabold" style={{ color: "var(--brand)" }}>Create an account</Link></>}
      </p>
    </>
  );
}
