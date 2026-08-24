import { Search } from "lucide-react";
import { ThreadCard } from "@/components/forum/thread-card";
import { searchThreads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams; const threads = await searchThreads(q);
  return <div className="shell max-w-4xl py-9"><div className="eyebrow">Discovery</div><h1 className="mt-1 text-3xl font-black">Search the forum</h1><form className="relative mt-6"><Search className="absolute left-4 top-1/2 -translate-y-1/2 muted" size={18} /><input className="input !py-3 !pl-11" name="q" defaultValue={q} placeholder="Search titles, posts, tags, and members" autoFocus /></form>{q && <div className="mb-4 mt-8 text-sm font-semibold muted">{threads.length} result{threads.length === 1 ? "" : "s"} for “{q}”</div>}<div className="space-y-3">{threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}{q && !threads.length && <div className="card p-10 text-center"><h2 className="font-bold">Nothing surfaced</h2><p className="mt-1 muted">Try fewer or more general terms.</p></div>}</div></div>;
}
