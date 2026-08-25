"use client";

import { useUser } from "@clerk/nextjs";
import type { CreateExternalAccountParams, ExternalAccountResource, ReauthorizeExternalAccountParams } from "@clerk/nextjs/types";
import { Check, Link2, LoaderCircle, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/auth-controls";
import { clerkErrorMessage } from "@/components/auth/auth-utils";
import { SOCIAL_CONNECTIONS, SocialConnectionIcon } from "@/components/auth/social-connections";
import { useCustomReverification } from "./reverification";

const github = SOCIAL_CONNECTIONS[0];
const settingsRedirect = "/settings";

function StatusMessage({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-4 text-sm font-semibold" style={{ color: "var(--brand-dark)" }} role="status">{children}</p>;
}

export function SocialAccountSettings() {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState<"connect" | "retry" | "disconnect" | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const createExternalAccount = useCustomReverification(async (params: CreateExternalAccountParams) => user?.createExternalAccount(params));
  const reauthorizeExternalAccount = useCustomReverification(async (account: ExternalAccountResource, params: ReauthorizeExternalAccountParams) => account.reauthorize(params));
  const destroyExternalAccount = useCustomReverification(async (account: ExternalAccountResource) => account.destroy());
  const account = (user?.externalAccounts ?? []).find((candidate) => candidate.provider === github.provider);
  const verified = account?.verification?.status === "verified";
  const identifier = account?.accountIdentifier() || account?.username || account?.emailAddress;
  const verificationError = account?.verification?.error
    ? clerkErrorMessage(account.verification.error, "GitHub needs to be connected again.")
    : "GitHub needs to be connected again.";

  function followVerification(nextAccount: ExternalAccountResource) {
    const destination = nextAccount.verification?.externalVerificationRedirectURL;
    if (!destination) throw new Error("GitHub did not provide a verification link. Please try again.");
    router.push(destination.href);
  }

  async function connect() {
    if (!user) return;
    setBusy("connect");
    setError("");
    setSuccess("");
    try {
      const created = await createExternalAccount({ strategy: github.strategy, redirectUrl: settingsRedirect });
      if (!created) throw new Error("The GitHub connection was not created.");
      followVerification(created);
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t start the GitHub connection."));
      setBusy(null);
    }
  }

  async function retry() {
    if (!account) return;
    setBusy("retry");
    setError("");
    setSuccess("");
    try {
      const refreshed = await reauthorizeExternalAccount(account, { redirectUrl: settingsRedirect });
      followVerification(refreshed);
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t restart the GitHub connection."));
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!account || !user) return;
    setBusy("disconnect");
    setError("");
    setSuccess("");
    try {
      await destroyExternalAccount(account);
      await user.reload();
      setConfirmingDisconnect(false);
      setSuccess("GitHub disconnected.");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t disconnect GitHub."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="connected-accounts-heading">
      <div className="flex items-center gap-2">
        <Link2 size={19} style={{ color: "var(--brand)" }} aria-hidden="true" />
        <h2 id="connected-accounts-heading" className="text-xl font-black">Connected accounts</h2>
      </div>
      <p className="mt-1 text-sm muted">Connect another sign-in method to your account.</p>
      <FormAlert>{error}</FormAlert>
      <StatusMessage>{success}</StatusMessage>

      <div className="mt-6 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <SocialConnectionIcon connection={github} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold">GitHub</h3>
              {verified && <span className="pill pill-strong"><Check size={12} aria-hidden="true" /> Connected</span>}
              {account && !verified && <span className="pill">Needs attention</span>}
            </div>
            <p className="mt-1 break-words text-sm muted">
              {verified
                ? <>Connected as <strong className="text-[var(--foreground)]">{identifier || "GitHub account"}</strong>.</>
                : account
                  ? verificationError
                  : "Use GitHub to sign in to this forum account."}
            </p>
          </div>

          {!account ? (
            <button type="button" className="button button-secondary shrink-0" disabled={busy !== null} onClick={() => void connect()}>
              {busy === "connect" ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {busy === "connect" ? "Connecting…" : "Connect GitHub"}
            </button>
          ) : (
            <div className="flex shrink-0 flex-wrap gap-2">
              {!verified && <button type="button" className="button button-secondary" disabled={busy !== null} onClick={() => void retry()}>{busy === "retry" ? "Retrying…" : "Retry connection"}</button>}
              <button type="button" className="button button-ghost" disabled={busy !== null} onClick={() => setConfirmingDisconnect(true)}><Unlink size={16} aria-hidden="true" /> {verified ? "Disconnect" : "Remove"}</button>
            </div>
          )}
        </div>

        {account && confirmingDisconnect && (
          <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "color-mix(in srgb, var(--danger) 24%, var(--line))", background: "var(--surface)" }} role="group" aria-label="Confirm GitHub disconnect">
            <p className="text-sm font-bold">{verified ? "Disconnect GitHub?" : "Remove this incomplete GitHub connection?"}</p>
            <p className="mt-1 text-xs muted">Make sure you can still sign in another way before continuing.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="button button-danger" disabled={busy !== null} onClick={() => void disconnect()}>{busy === "disconnect" ? "Disconnecting…" : verified ? "Yes, disconnect" : "Yes, remove"}</button>
              <button type="button" className="button button-secondary" disabled={busy !== null} onClick={() => setConfirmingDisconnect(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
