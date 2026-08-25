import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThreadCard } from "@/components/forum/thread-card";
import { NewThreadTrigger } from "@/components/new-thread-trigger";
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
  const postingPolicyLabel = category.postingPolicy === "ANNOUNCEMENTS"
    ? "Announcements"
    : category.postingPolicy === "ADMIN_ONLY"
      ? "Admin only"
      : null;
  const canViewerStart = !category.archivedAt && (viewer
    ? canStartDiscussion(viewer.role, category.postingPolicy)
    : category.postingPolicy === "OPEN");
  const restrictionNotice = category.postingPolicy === "ANNOUNCEMENTS"
    ? "Only admins can start discussions here. Everyone can still reply."
    : "Only admins can start discussions or reply here.";

  return (
    <div className="shell max-w-4xl py-9">
      <div className="card flex flex-wrap items-start gap-5 p-6 sm:p-8">
        <span className="mt-1 h-12 w-2 rounded-full" style={{ background: category.color }} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{category.archivedAt ? "Archived staff preview" : "Community space"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black">{category.name}</h1>
            {postingPolicyLabel ? <span className="pill">{postingPolicyLabel}</span> : null}
          </div>
          <p className="mt-2 muted">{category.description}</p>
        </div>
        {category.archivedAt ? <span className="pill">Archived</span> : canViewerStart ? (
          <NewThreadTrigger categoryId={category.id} className="button button-primary ml-auto">
            New thread
          </NewThreadTrigger>
        ) : (
          <p className="ml-auto max-w-xs rounded-xl border px-4 py-3 text-sm leading-5 muted" style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}>
            {restrictionNotice}
          </p>
        )}
      </div>
      <div className="mt-6 space-y-3">
        {threads.length ? (
          threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)
        ) : (
          <div className="card p-10 text-center muted">No discussions here yet.</div>
        )}
      </div>
    </div>
  );
}
