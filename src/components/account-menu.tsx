"use client";

import Image from "next/image";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import type { ForumRole } from "@/lib/roles";

type AccountMenuProps = {
  id: string;
  displayName: string;
  username: string;
  imageUrl: string | null;
  role: ForumRole;
};

function subscribeToHydration() {
  return () => undefined;
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function AccountMenu({ id, displayName, username, imageUrl, role }: AccountMenuProps) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [failedAvatarSrc, setFailedAvatarSrc] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = `account-menu-${id}`;
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
  const avatarSrc = (hydrated ? user?.imageUrl : null) || imageUrl;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      setSigningOut(false);
      setSignOutError(true);
    }
  }

  return (
    <div ref={rootRef} className="relative ml-1 h-10 w-10 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className="relative block h-10 w-10 overflow-hidden rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        style={{ borderColor: "var(--line)", background: "var(--brand-soft)" }}
        aria-label={`Account menu for ${displayName}`}
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="absolute inset-0 grid place-items-center font-extrabold" style={{ color: "var(--brand)" }} aria-hidden="true">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        {avatarSrc && failedAvatarSrc !== avatarSrc && (
          <Image
            className="absolute inset-0 h-10 w-10 object-cover"
            src={avatarSrc}
            alt=""
            width={80}
            height={80}
            loading="eager"
            onError={() => setFailedAvatarSrc(avatarSrc)}
          />
        )}
      </button>

      {open && (
        <nav
          id={menuId}
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border p-2 shadow-xl"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-label="Account menu"
        >
          <div className="border-b px-3 py-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2"><div className="truncate text-sm font-extrabold">{displayName}</div><UserRoleBadge role={role} /></div>
            <div className="truncate text-xs muted">@{username}</div>
          </div>
          <div className="py-1">
            <Link href="/settings" onClick={() => setOpen(false)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
              <Settings size={17} aria-hidden="true" />
              Account settings
            </Link>
            {(role === "MODERATOR" || role === "ADMIN") && (
              <Link href="/staff" onClick={() => setOpen(false)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
                <ShieldCheck size={17} aria-hidden="true" />
                Staff console
              </Link>
            )}
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]" style={{ color: "var(--danger)" }} disabled={signingOut} onClick={handleSignOut}>
              <LogOut size={17} aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
          {signOutError && <p className="mx-3 mb-2 text-xs" style={{ color: "var(--danger)" }} role="alert">We couldn’t sign you out. Please try again.</p>}
        </nav>
      )}
    </div>
  );
}
