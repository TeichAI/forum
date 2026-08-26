import { Search } from "lucide-react";
import { ThreadCard } from "@/components/forum/thread-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { searchThreadsPage } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string }> }) {
  const { q = "", cursor } = await searchParams;
  const threadPage = await searchThreadsPage(q, cursor);
  const threads = threadPage.items;
  const trimmed = q.trim();
  return (
    <div className="shell max-w-4xl py-8 sm:py-9">
      <PageHeader
        eyebrow="Discovery"
        title="Search the forum"
        description="Find discussions by title, post content, tags, or member names."
      />
      <form className="relative mt-6" role="search">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 muted" size={18} aria-hidden />
        <input
          className="input !py-3.5 !pl-11 text-base"
          name="q"
          defaultValue={q}
          placeholder="Search titles, posts, tags, and members"
          autoComplete="off"
          autoFocus
          aria-label="Search discussions"
        />
      </form>
      {trimmed ? (
        <div className="mt-6 flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm font-semibold muted">
            {threads.length} result{threads.length === 1 ? "" : "s"} for <span className="text-[var(--foreground)]">“{trimmed}”</span>
          </p>
          {threads.length ? <span className="text-xs muted">Most recently active</span> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm muted">Try a keyword, tag (like #api), or member name.</p>
      )}
      <div className="mt-6 space-y-3">
        {threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}
        {trimmed && !threads.length && (
          <EmptyState
            title="Nothing surfaced"
            description="Try fewer or more general terms, or check your spelling."
          />
        )}
      </div>
      {threadPage.nextCursor ? <div className="mt-4 text-center"><a className="button button-secondary" href={`/search?q=${encodeURIComponent(trimmed)}&cursor=${encodeURIComponent(threadPage.nextCursor)}`}>More results</a></div> : null}
    </div>
  );
}
