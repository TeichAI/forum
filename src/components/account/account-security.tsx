"use client";

import { useClerk, useSession, useUser } from "@clerk/nextjs";
import type { EmailAddressResource, SessionWithActivitiesResource } from "@clerk/nextjs/types";
import { formatDistanceToNow } from "date-fns";
import { Camera, KeyRound, Laptop, Mail, RefreshCw, ShieldAlert, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncAccountIdentity } from "@/actions/account";
import { CodeInput, FormAlert, PasswordInput } from "@/components/auth/auth-controls";
import { clerkErrorMessage } from "@/components/auth/auth-utils";
import { Avatar } from "@/components/ui/avatar";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";
import { ReverificationProvider, useCustomReverification } from "./reverification";
import { SocialAccountSettings } from "./social-account-settings";

type AccountSecurityProps = {
  displayName: string;
  username: string;
  imageUrl: string | null;
};

function StatusMessage({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-3 text-sm font-semibold" style={{ color: "var(--brand-dark)" }} role="status">{children}</p>;
}

export function AccountSecurity(props: AccountSecurityProps) {
  return (
    <ReverificationProvider>
      <AccountSecuritySections {...props} />
    </ReverificationProvider>
  );
}

function AccountSecuritySections(props: AccountSecurityProps) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div className="card p-8 text-center text-sm muted" role="status">Loading account security…</div>;
  if (!isSignedIn) return <div className="card p-8 text-center text-sm muted" role="alert">Your session ended. Refresh and sign in again.</div>;
  return (
    <>
      <AvatarSettings displayName={props.displayName} initialImageUrl={props.imageUrl} />
      <section className="card p-6 sm:p-8" aria-labelledby="login-security-heading">
        <div className="mb-7">
          <h2 id="login-security-heading" className="text-xl font-black">Login &amp; security</h2>
          <p className="mt-1 text-sm muted">Keep your email and password current.</p>
        </div>
        <EmailSettings />
        <hr className="divider my-7" />
        <PasswordSettings />
      </section>
      <SocialAccountSettings />
      <SessionSettings />
      <DeleteAccount username={props.username} />
    </>
  );
}

function AvatarSettings({ displayName, initialImageUrl }: { displayName: string; initialImageUrl: string | null }) {
  const { user } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const currentImage = user?.imageUrl || initialImageUrl;

  async function saveImage(file: File | null) {
    if (!user) return;
    setError("");
    setSuccess("");
    if (file && file.size > 10 * 1024 * 1024) return setError("Choose an image smaller than 10 MB.");
    if (file && !file.type.startsWith("image/")) return setError("Choose a valid image file.");
    setBusy(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
      const synced = await syncAccountIdentity();
      if (!synced.ok) setError(synced.message ?? "The forum avatar could not be refreshed.");
      else setSuccess(file ? "Profile photo updated." : "Profile photo removed.");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t update your profile photo."));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  }

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="photo-settings-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar src={currentImage} name={displayName} className="!h-20 !w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="photo-settings-heading" className="text-xl font-black">Profile photo</h2>
          <p className="mt-1 text-sm muted">JPG, PNG, GIF, or WebP. Maximum size 10 MB.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className={`button button-secondary ${busy ? "pointer-events-none opacity-55" : ""}`}>
              <Camera size={16} aria-hidden="true" /> {busy ? "Uploading…" : "Choose photo"}
              <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void saveImage(file); }} />
            </label>
            {user?.hasImage && <button type="button" className="button button-ghost" disabled={busy} onClick={() => void saveImage(null)}><X size={16} aria-hidden="true" /> Remove</button>}
          </div>
          <FormAlert>{error}</FormAlert>
          <StatusMessage>{success}</StatusMessage>
        </div>
      </div>
    </section>
  );
}

function EmailSettings() {
  const { user } = useUser();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState<EmailAddressResource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const createEmail = useCustomReverification(async (value: string) => user?.createEmailAddress({ email: value }));
  const makePrimary = useCustomReverification(async (emailAddressId: string) => user?.update({ primaryEmailAddressId: emailAddressId }));
  const removeEmail = useCustomReverification(async (address: EmailAddressResource) => address.destroy());

  async function begin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || nextEmail === user.primaryEmailAddress?.emailAddress.toLowerCase()) return setError("Enter a different email address.");
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const created = await createEmail(nextEmail);
      if (!created) throw new Error("The email address was not created.");
      await created.prepareVerification({ strategy: "email_code" });
      setPendingEmail(created);
      setCode("");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t start the email change."));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !pendingEmail) return;
    const previous = user.primaryEmailAddress;
    setBusy(true);
    setError("");
    try {
      const verified = await pendingEmail.attemptVerification({ code });
      await makePrimary(verified.id);
      let cleanupFailed = false;
      if (previous && previous.id !== verified.id) {
        try { await removeEmail(previous); } catch { cleanupFailed = true; }
      }
      await user.reload();
      const synced = await syncAccountIdentity();
      if (!synced.ok) throw new Error(synced.message);
      setPendingEmail(null);
      setEmail("");
      setCode("");
      setSuccess(cleanupFailed ? "Email updated. Your previous address could not be removed yet." : "Email address updated.");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!pendingEmail) return;
    setBusy(true);
    setError("");
    try {
      await pendingEmail.prepareVerification({ strategy: "email_code" });
      setSuccess("A new code was sent.");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t resend the code."));
    } finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true);
    if (pendingEmail) {
      try { await removeEmail(pendingEmail); } catch { /* Clerk will eventually discard an unverified address. */ }
    }
    setPendingEmail(null);
    setEmail("");
    setCode("");
    setError("");
    setSuccess("");
    setBusy(false);
  }

  return (
    <div aria-labelledby="email-settings-heading">
      <div className="flex items-center gap-2"><Mail size={18} style={{ color: "var(--brand)" }} aria-hidden="true" /><h3 id="email-settings-heading" className="font-extrabold">Email address</h3></div>
      <p className="mt-1 text-sm muted">Your current sign-in email is <strong className="text-[var(--foreground)]">{user?.primaryEmailAddress?.emailAddress ?? "Unavailable"}</strong>.</p>
      <FormAlert>{error}</FormAlert>
      <StatusMessage>{success}</StatusMessage>
      {pendingEmail ? (
        <form className="mt-4 max-w-lg" onSubmit={verify}>
          <p className="mb-3 text-sm muted">Enter the 6-digit code sent to <strong className="text-[var(--foreground)]">{pendingEmail.emailAddress}</strong>.</p>
          <label className="label" htmlFor="new-email-code">Verification code</label>
          <CodeInput id="new-email-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required disabled={busy} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="button button-primary" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify email"}</button>
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => void resend()}><RefreshCw size={15} aria-hidden="true" /> Resend</button>
            <button type="button" className="button button-ghost" disabled={busy} onClick={() => void cancel()}>Cancel</button>
          </div>
        </form>
      ) : (
        <form className="mt-4 flex max-w-lg flex-col gap-2 sm:flex-row" onSubmit={begin}>
          <label className="sr-only" htmlFor="new-email">New email address</label>
          <input id="new-email" className="input" type="email" autoComplete="email" placeholder="new@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} />
          <button className="button button-secondary shrink-0" disabled={busy}>{busy ? "Sending…" : "Change email"}</button>
        </form>
      )}
    </div>
  );
}

function PasswordSettings() {
  const { user } = useUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const updatePassword = useCustomReverification(async (args: { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean }) => user?.updatePassword(args));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setError("");
    setSuccess("");
    if (newPassword.length < 8) return setError("Use at least 8 characters for your new password.");
    if (newPassword !== confirmPassword) return setError("Those passwords do not match.");
    setBusy(true);
    try {
      await updatePassword({ currentPassword: user.passwordEnabled ? currentPassword : undefined, newPassword, signOutOfOtherSessions: true });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(user.passwordEnabled ? "Password updated. Other devices were signed out." : "Password created. Other devices were signed out.");
      await user.reload();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t update your password."));
    } finally { setBusy(false); }
  }

  return (
    <div aria-labelledby="password-settings-heading">
      <div className="flex items-center gap-2"><KeyRound size={18} style={{ color: "var(--brand)" }} aria-hidden="true" /><h3 id="password-settings-heading" className="font-extrabold">{user?.passwordEnabled ? "Change password" : "Create a password"}</h3></div>
      <p className="mt-1 text-sm muted">Changing your password signs out every other active device.</p>
      <FormAlert>{error}</FormAlert>
      <StatusMessage>{success}</StatusMessage>
      <form className="mt-4 max-w-lg space-y-4" onSubmit={submit} noValidate>
        {user?.passwordEnabled && <div><label className="label" htmlFor="current-account-password">Current password</label><PasswordInput id="current-account-password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={busy} /></div>}
        <div><label className="label" htmlFor="new-account-password">New password</label><PasswordInput id="new-account-password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={busy} /></div>
        <div><label className="label" htmlFor="confirm-account-password">Confirm new password</label><PasswordInput id="confirm-account-password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={busy} /></div>
        <button className="button button-secondary" disabled={busy || (Boolean(user?.passwordEnabled) && !currentPassword) || !newPassword || !confirmPassword}>{busy ? "Updating…" : user?.passwordEnabled ? "Update password" : "Create password"}</button>
      </form>
    </div>
  );
}

function SessionSettings() {
  const { user } = useUser();
  const { session } = useSession();
  const [sessions, setSessions] = useState<SessionWithActivitiesResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const revoke = useCustomReverification(async (target: SessionWithActivitiesResource) => target.revoke());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const values = await user.getSessions();
      setSessions([...values].sort((left, right) => {
        if (left.id === session?.id) return -1;
        if (right.id === session?.id) return 1;
        return right.lastActiveAt.getTime() - left.lastActiveAt.getTime();
      }));
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t load your active sessions."));
    } finally { setLoading(false); }
  }, [session?.id, user]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function remove(target: SessionWithActivitiesResource) {
    setRevoking(target.id);
    setError("");
    setSuccess("");
    try {
      await revoke(target);
      setSuccess("That device was signed out.");
      await load();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t revoke that session."));
    } finally { setRevoking(null); }
  }

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="session-settings-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="session-settings-heading" className="text-xl font-black">Active sessions</h2><p className="mt-1 text-sm muted">Devices currently signed in to your account.</p></div>
        <button type="button" className="button button-ghost" disabled={loading} onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
      </div>
      <FormAlert>{error}</FormAlert>
      <StatusMessage>{success}</StatusMessage>
      {loading ? <p className="mt-6 text-sm muted" role="status">Loading sessions…</p> : (
        <div className="mt-6 divide-y" style={{ borderColor: "var(--line)" }}>
          {sessions.map((item) => {
            const current = item.id === session?.id;
            const activity = item.latestActivity;
            const device = [activity.browserName, activity.deviceType].filter(Boolean).join(" on ") || "Unknown device";
            const location = [activity.city, activity.country].filter(Boolean).join(", ");
            return (
              <div key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "var(--surface-soft)", color: "var(--brand)" }}><Laptop size={19} aria-hidden="true" /></div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><strong>{device}</strong>{current && <span className="pill">This device</span>}</div>
                  <div className="mt-1 muted">{location || activity.ipAddress || "Location unavailable"} · Active {formatDistanceToNow(item.lastActiveAt, { addSuffix: true })}</div>
                </div>
                {!current && <button type="button" className="button button-ghost shrink-0" disabled={revoking === item.id} onClick={() => void remove(item)}>{revoking === item.id ? "Signing out…" : "Sign out device"}</button>}
              </div>
            );
          })}
          {!sessions.length && <p className="text-sm muted">No active sessions were found.</p>}
        </div>
      )}
    </section>
  );
}

function DeleteAccount({ username }: { username: string }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limitTrigger, setLimitTrigger] = useState<object | null>(null);
  const { coolingDown, onReady } = useRateLimitCooldown(limitTrigger);
  const requestDeletion = useCustomReverification(async (value: string) => {
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: value }),
    });
    const body = await response.json() as { ok?: boolean; error?: string };
    return { ...body, limited: response.status === 429 || response.headers.has("Retry-After") };
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== username) return setError(`Type ${username} exactly to confirm.`);
    setBusy(true);
    setError("");
    try {
      const body = await requestDeletion(confirmation);
      if (!body.ok) {
        setLimitTrigger(body.limited ? {} : null);
        setError(body.error ?? "Account deletion failed.");
        setBusy(false);
        return;
      }
      try { await signOut({ redirectUrl: "/" }); }
      catch { router.replace("/"); router.refresh(); }
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We couldn’t delete your account."));
      setBusy(false);
    }
  }

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="delete-account-heading" style={{ borderColor: "color-mix(in srgb, var(--danger) 32%, var(--line))" }}>
      <div className="flex items-center gap-2" style={{ color: "var(--danger)" }}><ShieldAlert size={19} aria-hidden="true" /><h2 id="delete-account-heading" className="text-xl font-black">Danger zone</h2></div>
      <h3 className="mt-5 font-extrabold">Delete account</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 muted">This permanently removes your sign-in. Existing forum posts remain for community and moderation history, but your member profile will no longer be available.</p>
      {!user?.deleteSelfEnabled ? <p className="mt-4 text-sm muted">Self-service account deletion is disabled for this account.</p> : (
        <form className="mt-5 max-w-lg" onSubmit={submit}>
          <label className="label" htmlFor="delete-confirmation">Type <strong>{username}</strong> to confirm</label>
          <input id="delete-confirmation" className="input" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy} aria-describedby="delete-account-warning" />
          <p id="delete-account-warning" className="mt-2 text-xs muted">You will verify your identity before the account is deleted.</p>
          <FormAlert>{error}</FormAlert>
          {limitTrigger ? <div className="mt-2" style={{ color: "var(--danger)" }}><RateLimitCountdown trigger={limitTrigger} onReady={onReady} /></div> : null}
          <button className="button button-danger mt-4" disabled={busy || coolingDown || confirmation !== username}><Trash2 size={16} aria-hidden="true" /> {busy ? "Deleting…" : "Delete my account"}</button>
        </form>
      )}
    </section>
  );
}
