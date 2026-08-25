import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Hash } from "lucide-react";
import { PostingPolicyBadge } from "@/components/forum/space-posting-policy";
import { ThreadCard } from "@/components/forum/thread-card";
import { NewThreadTrigger } from "@/components/new-thread-trigger";
import { EmptyState } from "@/components/ui/empty-state";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { canModerate, listThreads } from "@/lib/queries";
import { canStartDiscussion } from "@/lib/space-posting-permissions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = await db.category.findUnique({ where: { slug } });
  return { title: category?.name ?? "Space", description: category?.description };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [category, viewer] = await Promise.all([
    db.category.findUnique({ where: { slug } }),
    getViewer(),
  ]);
  if (!category || (category.archivedAt && !canModerate(viewer))) notFound();

  const threads = await listThreads({ categoryId: category.id });
  const canViewerStart = !category.archivedAt && (viewer
    ? canStartDiscussion(viewer.role, category.postingPolicy)
    : category.postingPolicy === "OPEN");
  const restrictionNotice = category.postingPolicy === "ANNOUNCEMENTS"
    ? "Only admins can start discussions here. Everyone can still reply."
    : "Only admins can start discussions or reply here.";

  return (
    <div className="shell max-w-4xl py-8 sm:py-9">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start gap-5 p-6 sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-xl border" style={{ background: `color-mix(in srgb, ${category.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${category.color} 20%, transparent)`, color: category.color }} aria-hidden>
            <Hash size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{category.archivedAt ? "Archived · staff preview" : "Community space"}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{category.name}</h1>
              {category.postingPolicy !== "OPEN" ? <PostingPolicyBadge policy={category.postingPolicy} /> : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 muted sm:text-[0.95rem]">{category.description}</p>
          </div>
          <div className="ml-auto pt-1">
            {category.archivedAt ? <span className="pill">Archived</span> : canViewerStart ? (
              <NewThreadTrigger categoryId={category.id} className="button button-primary">
                New thread
              </NewThreadTrigger>
            ) : (
              <p className="max-w-xs rounded-xl border px-4 py-3 text-sm leading-5 muted" style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}>
                {restrictionNotice}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {threads.length ? (
          threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)
        ) : (
          <EmptyState title="No discussions here yet." description="Be the first to share an idea in this space." action={canViewerStart ? <NewThreadTrigger categoryId={category.id} className="button button-primary">Start a discussion</NewThreadTrigger> : null} />
        )}
      </div>
    </div>
  );
}
