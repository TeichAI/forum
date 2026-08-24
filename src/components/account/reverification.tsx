"use client";

import { useReverification, useSession } from "@clerk/nextjs";
import type {
  SessionVerificationFirstFactor,
  SessionVerificationLevel,
  SessionVerificationResource,
  SessionVerificationSecondFactor,
} from "@clerk/nextjs/types";
import { ShieldCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { CodeInput, FormAlert, PasswordInput } from "@/components/auth/auth-controls";
import { clerkErrorMessage } from "@/components/auth/auth-utils";

type ReverificationRequest = {
  complete: () => void;
  cancel: () => void;
  level?: SessionVerificationLevel;
};

type NeedsReverification = (request: ReverificationRequest) => void;
const ReverificationContext = createContext<NeedsReverification | null>(null);

export function ReverificationProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ReverificationRequest | null>(null);
  const handleRequest = useCallback<NeedsReverification>((next) => setRequest(next), []);

  return (
    <ReverificationContext.Provider value={handleRequest}>
      {children}
      {request && (
        <ReverificationDialog
          request={request}
          onComplete={() => {
            request.complete();
            setRequest(null);
          }}
          onCancel={() => {
            request.cancel();
            setRequest(null);
          }}
        />
      )}
    </ReverificationContext.Provider>
  );
}

export function useCustomReverification<Args extends unknown[], Result>(fetcher: (...args: Args) => Promise<Result>) {
  const onNeedsReverification = useContext(ReverificationContext);
  if (!onNeedsReverification) throw new Error("useCustomReverification must be used inside ReverificationProvider");
  return useReverification(fetcher, { onNeedsReverification });
}

type SupportedFactor = SessionVerificationFirstFactor | SessionVerificationSecondFactor;

function factorKey(factor: SupportedFactor) {
  if (factor.strategy === "email_code") return `email:${factor.emailAddressId}`;
  if (factor.strategy === "phone_code") return `phone:${factor.phoneNumberId}`;
  return factor.strategy;
}

function factorLabel(factor: SupportedFactor) {
  if (factor.strategy === "password") return "Password";
  if (factor.strategy === "email_code") return `Email code${factor.safeIdentifier ? ` to ${factor.safeIdentifier}` : ""}`;
  if (factor.strategy === "phone_code") return `Text message${factor.safeIdentifier ? ` to ${factor.safeIdentifier}` : ""}`;
  if (factor.strategy === "totp") return "Authenticator app";
  if (factor.strategy === "backup_code") return "Backup code";
  return "Security key";
}

function preferredFactor(factors: SupportedFactor[]) {
  const preference = ["password", "email_code", "phone_code", "totp", "backup_code"];
  return factors.filter((factor) => preference.includes(factor.strategy)).sort((left, right) => preference.indexOf(left.strategy) - preference.indexOf(right.strategy))[0];
}

function ReverificationDialog({ request, onComplete, onCancel }: { request: ReverificationRequest; onComplete: () => void; onCancel: () => void }) {
  const { session } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [verification, setVerification] = useState<SessionVerificationResource | null>(null);
  const [factor, setFactor] = useState<SupportedFactor | null>(null);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const factors = useMemo<SupportedFactor[]>(() => {
    if (!verification) return [];
    return verification.status === "needs_second_factor"
      ? verification.supportedSecondFactors ?? []
      : verification.supportedFirstFactors ?? [];
  }, [verification]);

  const prepare = useCallback(async (selected: SupportedFactor, secondFactor: boolean) => {
    if (!session) return;
    if (selected.strategy === "email_code") {
      await session.prepareFirstFactorVerification({ strategy: "email_code", emailAddressId: selected.emailAddressId });
    } else if (selected.strategy === "phone_code") {
      if (secondFactor) await session.prepareSecondFactorVerification({ strategy: "phone_code", phoneNumberId: selected.phoneNumberId });
      else await session.prepareFirstFactorVerification({ strategy: "phone_code", phoneNumberId: selected.phoneNumberId });
    }
  }, [session]);

  const selectFactor = useCallback(async (selected: SupportedFactor, current: SessionVerificationResource) => {
    setFactor(selected);
    setCredential("");
    setError("");
    setBusy(true);
    try {
      await prepare(selected, current.status === "needs_second_factor");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t start verification. Please try another method."));
    } finally {
      setBusy(false);
    }
  }, [prepare]);

  useEffect(() => {
    dialogRef.current?.showModal();
    if (!session) {
      queueMicrotask(() => {
        setBusy(false);
        setError("Your session is no longer available. Refresh and sign in again.");
      });
      return;
    }
    let cancelled = false;
    session.startVerification({ level: request.level ?? "first_factor" }).then(async (result) => {
      if (cancelled) return;
      setVerification(result);
      if (result.status === "complete") return onComplete();
      const available = result.status === "needs_second_factor" ? result.supportedSecondFactors ?? [] : result.supportedFirstFactors ?? [];
      const selected = preferredFactor(available);
      if (!selected) {
        setBusy(false);
        setError("No supported verification method is available for this account.");
        return;
      }
      await selectFactor(selected, result);
    }).catch((caught) => {
      if (!cancelled) {
        setBusy(false);
        setError(clerkErrorMessage(caught, "We couldn’t start verification."));
      }
    });
    return () => { cancelled = true; };
  }, [onComplete, request.level, selectFactor, session]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !verification || !factor || !credential) return;
    setBusy(true);
    setError("");
    try {
      let result: SessionVerificationResource;
      if (verification.status === "needs_second_factor") {
        result = await session.attemptSecondFactorVerification(
          factor.strategy === "totp" ? { strategy: "totp", code: credential }
            : factor.strategy === "backup_code" ? { strategy: "backup_code", code: credential }
              : { strategy: "phone_code", code: credential },
        );
      } else {
        result = await session.attemptFirstFactorVerification(
          factor.strategy === "password" ? { strategy: "password", password: credential }
            : factor.strategy === "email_code" ? { strategy: "email_code", code: credential }
              : { strategy: "phone_code", code: credential },
        );
      }
      setVerification(result);
      if (result.status === "complete") return onComplete();
      const available = result.supportedSecondFactors ?? [];
      const selected = preferredFactor(available);
      if (!selected) throw new Error("No supported second factor is available.");
      await selectFactor(selected, result);
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That verification was not accepted."));
    } finally {
      setBusy(false);
    }
  }

  async function changeFactor(key: string) {
    const selected = factors.find((item) => factorKey(item) === key);
    if (selected && verification) await selectFactor(selected, verification);
  }

  async function resend() {
    if (!factor || !verification) return;
    setBusy(true);
    setError("");
    try {
      await prepare(factor, verification.status === "needs_second_factor");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t resend the code."));
    } finally {
      setBusy(false);
    }
  }

  const password = factor?.strategy === "password";
  const backup = factor?.strategy === "backup_code";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="card m-auto w-[calc(100%-1.5rem)] max-w-md p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><ShieldCheck size={21} aria-hidden="true" /></div>
          <button type="button" className="button button-ghost !h-10 !w-10 !p-0" aria-label="Cancel identity verification" onClick={onCancel}><X size={19} aria-hidden="true" /></button>
        </div>
        <h2 id={titleId} className="mt-5 text-xl font-black">Confirm it’s you</h2>
        <p className="mb-5 mt-2 text-sm leading-6 muted">For your security, verify your identity before continuing.</p>
        <FormAlert>{error}</FormAlert>
        {busy && !factor && !error && <p className="text-sm muted" role="status">Preparing verification…</p>}
        {factor && (
          <form onSubmit={submit}>
            {factors.length > 1 && (
              <div className="mb-4">
                <label className="label" htmlFor="verification-method">Verification method</label>
                <select id="verification-method" className="input" value={factorKey(factor)} disabled={busy} onChange={(event) => void changeFactor(event.target.value)}>
                  {factors.filter((item) => ["password", "email_code", "phone_code", "totp", "backup_code"].includes(item.strategy)).map((item) => <option key={factorKey(item)} value={factorKey(item)}>{factorLabel(item)}</option>)}
                </select>
              </div>
            )}
            <label className="label" htmlFor="reverification-credential">{password ? "Password" : backup ? "Backup code" : "Verification code"}</label>
            {password
              ? <PasswordInput id="reverification-credential" value={credential} onChange={(event) => setCredential(event.target.value)} autoComplete="current-password" required autoFocus disabled={busy} />
              : <CodeInput id="reverification-credential" value={credential} onChange={(event) => setCredential(event.target.value.replace(/\s/g, ""))} inputMode={backup ? "text" : "numeric"} maxLength={backup ? 64 : 6} required autoFocus disabled={busy} />}
            {!password && factor.strategy !== "totp" && factor.strategy !== "backup_code" && <button type="button" className="mt-2 text-xs font-bold" style={{ color: "var(--brand)" }} disabled={busy} onClick={() => void resend()}>Resend code</button>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={busy || !credential}>{busy ? "Verifying…" : "Verify"}</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
