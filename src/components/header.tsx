import Link from "next/link";
import { Bell, Bookmark, MessageCircle, Plus, Search, ShieldCheck } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { NewThreadTrigger } from "@/components/new-thread-trigger";
import { db } from "@/lib/db";
import { isE2ETestMode } from "@/lib/e2e-auth";
import type { ClerkAccessMode } from "@/lib/access-mode";
import type { ForumRole } from "@/lib/roles";

export type HeaderViewer = {
  id: string;
  displayName: string;
  username: string;
  imageUrl: string | null;
  role: ForumRole;
};

export async function Header({ viewer, accessMode = "public" }: { viewer: HeaderViewer | null; accessMode?: ClerkAccessMode }) {
  const unread = viewer ? await db.notification.count({ where: { recipientId: viewer.id, readAt: null } }) : 0;
  const hasUnread = unread > 0;
  return (
    <header className="sticky top-0 z-50 border-b backdrop-blur-xl" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--background) 92%, transparent)" }}>
      <div className="shell flex h-[60px] items-center gap-3 sm:h-16 sm:gap-4">
        <Link href="/" className="mr-1 flex items-center gap-2 sm:mr-2" aria-label="Teich Forum home">
          <span className="text-[1.05rem] font-black tracking-tight">Teich <span style={{ color: "var(--brand)" }}>Forum</span></span>
        </Link>

        <form action="/search" className="desktop-only relative ml-auto hidden w-full max-w-sm flex-1 sm:flex" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--muted)" }} aria-hidden />
          <input
            className="input !rounded-full !py-2 !pl-9 text-sm"
            name="q"
            placeholder="Search discussions"
            aria-label="Search discussions"
            autoComplete="off"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1 sm:ml-0" aria-label="Account navigation">
          {viewer ? (
            <>
              <NewThreadTrigger className="button button-primary !h-9 !w-9 !p-0 min-[761px]:!h-10 min-[761px]:!w-auto min-[761px]:!px-4" aria-label="New thread">
                <Plus size={16} aria-hidden />
                <span className="desktop-only">New thread</span>
              </NewThreadTrigger>
              <Link href="/bookmarks" className="button button-ghost hidden !h-9 !w-9 !p-0 sm:inline-flex sm:!h-10 sm:!w-10" aria-label="Bookmarks" title="Bookmarks">
                <Bookmark size={18} aria-hidden />
              </Link>
              <Link href="/messages" className="button button-ghost !h-9 !w-9 !p-0 sm:!h-10 sm:!w-10" aria-label="Messages" title="Messages">
                <MessageCircle size={18} aria-hidden />
              </Link>
              {(viewer.role === "MODERATOR" || viewer.role === "ADMIN") && (
                <Link href="/staff" className="button button-ghost hidden !h-9 !w-9 !p-0 sm:inline-flex sm:!h-10 sm:!w-10" aria-label="Staff console" title="Staff console">
                  <ShieldCheck size={18} aria-hidden />
                </Link>
              )}
              <Link
                href="/notifications"
                className="button button-ghost relative !h-9 !w-9 !p-0 sm:!h-10 sm:!w-10"
                aria-label={hasUnread ? `${unread} unread notifications` : "Notifications"}
                title={hasUnread ? `${unread} unread` : "Notifications"}
              >
                <Bell size={18} aria-hidden />
                {hasUnread && <span className="absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-[var(--background)]" style={{ background: "var(--danger)" }} aria-hidden />}
              </Link>
              {isE2ETestMode() ? (
                <span className="pill ml-1">Test user</span>
              ) : (
                <AccountMenu id={viewer.id} displayName={viewer.displayName} username={viewer.username} imageUrl={viewer.imageUrl} role={viewer.role} />
              )}
            </>
          ) : (
            <>
              <Link href="/sign-in" className="button button-secondary">
                Sign in
              </Link>
              <Link href={accessMode === "waitlist" ? "/waitlist" : "/sign-up"} className="button button-primary">
                {accessMode === "waitlist" ? "Join waitlist" : accessMode === "restricted" ? "Invitation only" : "Join Teich"}
              </Link>
            </>
          )}
        </nav>
      </div>
      <div className="mobile-only border-t px-4 py-2.5" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <form action="/search" className="relative" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--muted)" }} aria-hidden />
          <input className="input !rounded-full !py-2 !pl-9 text-sm" name="q" placeholder="Search discussions" aria-label="Search discussions" />
        </form>
      </div>
    </header>
  );
}
