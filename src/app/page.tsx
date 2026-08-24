import Link from "next/link";
import { ArrowRight, Droplets, Sparkles, Users } from "lucide-react";
import { CategoryList } from "@/components/forum/category-list";
import { NewThreadTrigger } from "@/components/new-thread-trigger";
import { ThreadCard } from "@/components/forum/thread-card";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { listThreads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort: rawSort } = await searchParams;
  const sort = rawSort === "new" || rawSort === "top" ? rawSort : "recent";
  const viewer = await getViewer();
  const [threads, categories, memberCount] = await Promise.all([
    listThreads({ sort }),
    db.category.findMany({ orderBy: { position: "asc" }, include: { _count: { select: { threads: { where: { status: "PUBLISHED" } } } } } }),
    viewer ? Promise.resolve(null) : db.user.count({ where: { status: "ACTIVE" } }),
  ]);
  return (
    <div className="shell py-8 sm:py-11">
      {viewer ? (
        <section className="card mb-6 px-6 py-5 sm:px-8 sm:py-6">
          <div className="eyebrow mb-2 flex items-center gap-2"><Droplets size={15} /> The Teich community</div>
          <h1 className="flex flex-wrap items-center gap-2 break-words text-2xl font-black tracking-tight sm:text-3xl">Welcome back, {viewer.displayName}<UserRoleBadge role={viewer.role} /></h1>
          <p className="mt-1 text-sm leading-6 muted sm:text-base">Catch up on the latest ideas and discussions.</p>
        </section>
      ) : (
        <section className="card relative mb-8 overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-50 blur-3xl" style={{ background: "var(--brand-soft)" }} />
          <div className="relative max-w-2xl">
            <div className="eyebrow mb-3 flex items-center gap-2"><Droplets size={15} /> The Teich community</div>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Ideas grow better<br />when we share them.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 muted sm:text-lg">Ask questions, share experiments, meet other builders, and help shape the future of Teich.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3"><NewThreadTrigger className="button button-primary">Start a discussion <ArrowRight size={16} /></NewThreadTrigger><span className="flex items-center gap-2 text-sm font-semibold muted"><Users size={17} /> {memberCount?.toLocaleString()} community members</span></div>
          </div>
        </section>
      )}
      <div className="grid gap-7 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-5"><CategoryList categories={categories} /><div className="card p-5"><Sparkles size={20} style={{ color: "var(--brand)" }} /><h2 className="mt-3 font-extrabold">New around here?</h2><p className="mt-1 text-sm leading-6 muted">Introduce yourself, explore what others are building, or jump into a question.</p></div></div>
        <section>
          <div className="mb-4 flex items-end justify-between gap-3"><div><div className="eyebrow">Community feed</div><h2 className="mt-1 text-2xl font-black">Latest discussions</h2></div><nav className="flex rounded-xl p-1 text-sm font-bold" style={{ background: "var(--surface-soft)" }}>{["recent", "new", "top"].map((item) => <Link key={item} href={`/?sort=${item}`} className="rounded-lg px-3 py-1.5 capitalize" style={sort === item ? { background: "var(--surface)", color: "var(--brand)" } : { color: "var(--muted)" }}>{item}</Link>)}</nav></div>
          <div className="space-y-3">{threads.length ? threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />) : <div className="card p-10 text-center"><h3 className="text-lg font-bold">The pond is quiet.</h3><p className="mt-1 muted">Be the first to start a discussion.</p></div>}</div>
        </section>
      </div>
    </div>
  );
}
