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
  return (
    <header className="sticky top-0 z-50 border-b backdrop-blur-xl" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--background) 86%, transparent)" }}>
      <div className="shell flex h-16 items-center gap-4">
        <Link href="/" className="mr-2 flex items-center" aria-label="Teich Forum home">
          <span className="text-[1.05rem] font-black tracking-tight">Teich <span style={{ color: "var(--brand)" }}>Forum</span></span>
        </Link>
        <form action="/search" className="desktop-only relative ml-auto w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--muted)" }} />
          <input className="input !rounded-full !py-2 !pl-9" name="q" placeholder="Search discussions" aria-label="Search discussions" />
        </form>
        <nav className="ml-auto flex items-center gap-1 sm:ml-0" aria-label="Account navigation">
          {viewer ? <>
            <NewThreadTrigger className="button button-primary"><Plus size={16} /><span className="desktop-only">New thread</span></NewThreadTrigger>
            <Link href="/bookmarks" className="button button-ghost !p-2.5" aria-label="Bookmarks"><Bookmark size={18} /></Link>
            <Link href="/messages" className="button button-ghost !p-2.5" aria-label="Messages"><MessageCircle size={18} /></Link>
            {(viewer.role === "MODERATOR" || viewer.role === "ADMIN") && <Link href="/staff" className="button button-ghost !p-2.5" aria-label="Staff console"><ShieldCheck size={18} /></Link>}
            <Link href="/notifications" className="button button-ghost relative !p-2.5" aria-label={`${unread} unread notifications`}>
              <Bell size={18} />{unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />}
            </Link>
            {isE2ETestMode() ? <span className="pill ml-1">Test user</span> : <AccountMenu id={viewer.id} displayName={viewer.displayName} username={viewer.username} imageUrl={viewer.imageUrl} role={viewer.role} />}
          </> : <>
            <Link href="/sign-in" className="button button-secondary">Sign in</Link>
            <Link href={accessMode === "waitlist" ? "/waitlist" : "/sign-up"} className="button button-primary">
              {accessMode === "waitlist" ? "Join waitlist" : accessMode === "restricted" ? "Invitation only" : "Join Teich"}
            </Link>
          </>}
        </nav>
      </div>
    </header>
  );
}
