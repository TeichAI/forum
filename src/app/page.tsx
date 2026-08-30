import Link from "next/link";
import { ArrowRight, Droplets, Sparkles, Users } from "lucide-react";
import { CategoryList } from "@/components/forum/category-list";
import { NewThreadTrigger } from "@/components/new-thread-trigger";
import { ThreadCard } from "@/components/forum/thread-card";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { listThreadsPage } from "@/lib/queries";
import { publicMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata({ path: "/" });

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string; cursor?: string }> }) {
  const { sort: rawSort, cursor } = await searchParams;
  const sort = rawSort === "new" || rawSort === "top" ? rawSort : "recent";
  const viewer = await getViewer();
  const [threadPage, categories, memberCount] = await Promise.all([
    listThreadsPage({ sort, cursor }),
    db.category.findMany({ where: { archivedAt: null }, orderBy: { position: "asc" }, include: { _count: { select: { threads: { where: { status: "PUBLISHED", author: { status: "ACTIVE" } } } } } } }),
    viewer ? Promise.resolve(null) : db.user.count({ where: { status: "ACTIVE" } }),
  ]);
  const threads = threadPage.items;
  return (
    <div className="shell py-6 sm:py-10">
      {viewer ? (
        <section className="card mb-6 px-6 py-5 sm:px-8 sm:py-6">
          <div className="eyebrow mb-2 flex items-center gap-2"><Droplets size={14} aria-hidden /> The Teich community</div>
          <h1 className="flex flex-wrap items-center gap-2 break-words text-2xl font-black tracking-tight sm:text-3xl">Welcome back, {viewer.displayName}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 muted sm:text-[0.95rem]">Catch up on the latest ideas and discussions.</p>
        </section>
      ) : (
        <section className="card relative mb-8 overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: "var(--brand-soft)" }} aria-hidden />
          <div className="absolute -right-10 bottom-0 h-40 w-40 rounded-full opacity-30 blur-2xl" style={{ background: "color-mix(in srgb, var(--brand) 10%, transparent)" }} aria-hidden />
          <div className="relative max-w-2xl">
            <div className="eyebrow mb-3 flex items-center gap-2"><Droplets size={14} aria-hidden /> The Teich community</div>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Ideas grow better<br />when we share them.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 muted sm:text-lg">Ask questions, share experiments, meet other builders, and help shape the future of Teich.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <NewThreadTrigger className="button button-primary button-lg">Start a discussion <ArrowRight size={16} aria-hidden /></NewThreadTrigger>
              <span className="flex items-center gap-2 text-sm font-semibold muted"><Users size={17} aria-hidden /> {memberCount?.toLocaleString()} community members</span>
            </div>
          </div>
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-7">
        <div className="space-y-4">
          <CategoryList categories={categories} />
          {viewer?.role === "ADMIN" && <Link href="/staff/spaces" className="button button-secondary w-full">Manage spaces</Link>}
          <div className="card p-5">
            <div className="flex items-center gap-2" style={{ color: "var(--brand)" }}><Sparkles size={18} aria-hidden /></div>
            <h2 className="mt-3 text-[0.95rem] font-extrabold tracking-tight">New around here?</h2>
            <p className="mt-1.5 text-sm leading-6 muted">Introduce yourself, explore what others are building, or jump into a question. Good discussions start with a clear title and a little context.</p>
          </div>
        </div>
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">Community feed</div>
              <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Latest discussions</h2>
              <p className="mt-1 text-sm muted">Browse recent conversations, new posts, or top-rated threads.</p>
            </div>
            <nav className="segmented" aria-label="Sort discussions">
              {["recent", "new", "top"].map((item) => (
                <Link
                  key={item}
                  href={`/?sort=${item}`}
                  aria-current={sort === item ? "page" : undefined}
                  className="capitalize"
                  style={sort === item ? { background: "var(--surface)", color: "var(--foreground)", boxShadow: "0 1px 0 rgba(255,255,255,.04)" } : { color: "var(--muted)" }}
                >
                  {item}
                </Link>
              ))}
            </nav>
          </div>
          <div className="space-y-3">
            {threads.length ? threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />) : <div className="card p-10 text-center"><h3 className="text-lg font-bold">The pond is quiet.</h3><p className="mt-1 muted">Be the first to start a discussion.</p></div>}
          </div>
          {threadPage.nextCursor && <div className="mt-4 text-center"><Link className="button button-secondary" href={`/?sort=${sort}&cursor=${encodeURIComponent(threadPage.nextCursor)}`}>More discussions</Link></div>}
        </section>
      </div>
    </div>
  );
}
