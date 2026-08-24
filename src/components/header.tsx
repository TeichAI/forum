import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Bell, Bookmark, MessageCircle, Plus, Search, ShieldCheck } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";

export async function Header() {
  const viewer = await getViewer();
  const unread = viewer ? await db.notification.count({ where: { recipientId: viewer.id, readAt: null } }) : 0;
  return (
    <header className="sticky top-0 z-50 border-b backdrop-blur-xl" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--background) 86%, transparent)" }}>
      <div className="shell flex h-16 items-center gap-4">
        <Link href="/" className="mr-2 flex items-center gap-2" aria-label="Teich Forum home">
          <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full" style={{ background: "var(--brand)" }}>
            <span className="absolute h-4 w-7 translate-y-1 rounded-[50%] border-2 border-white/80" />
            <span className="absolute h-2 w-4 -translate-y-1 rounded-[50%] bg-white/90" />
          </span>
          <span className="text-[1.05rem] font-black tracking-tight">Teich <span style={{ color: "var(--brand)" }}>Forum</span></span>
        </Link>
        <form action="/search" className="desktop-only relative ml-auto w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--muted)" }} />
          <input className="input !rounded-full !py-2 !pl-9" name="q" placeholder="Search discussions" aria-label="Search discussions" />
        </form>
        <nav className="ml-auto flex items-center gap-1 sm:ml-0" aria-label="Account navigation">
          {viewer ? <>
            <Link href="/new" className="button button-primary"><Plus size={16} /><span className="desktop-only">New thread</span></Link>
            <Link href="/bookmarks" className="button button-ghost !p-2.5" aria-label="Bookmarks"><Bookmark size={18} /></Link>
            <Link href="/messages" className="button button-ghost !p-2.5" aria-label="Messages"><MessageCircle size={18} /></Link>
            {(viewer.role === "MODERATOR" || viewer.role === "ADMIN") && <Link href="/moderation" className="button button-ghost !p-2.5" aria-label="Moderation"><ShieldCheck size={18} /></Link>}
            <Link href="/notifications" className="button button-ghost relative !p-2.5" aria-label={`${unread} unread notifications`}>
              <Bell size={18} />{unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />}
            </Link>
            <span className="ml-1"><UserButton /></span>
          </> : <>
            <Link href="/sign-in" className="button button-secondary">Sign in</Link>
            <Link href="/sign-up" className="button button-primary">Join Teich</Link>
          </>}
        </nav>
      </div>
    </header>
  );
}
