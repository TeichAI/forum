import Link from "next/link";
import { ArrowDown, ArrowUp, Bookmark, MessageCircle, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Prisma } from "@prisma/client";
import { threadListInclude } from "@/lib/queries";
import { excerpt } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { PostingPolicyBadge } from "@/components/forum/space-posting-policy";
import { UserRoleBadge } from "@/components/ui/user-role-badge";

type ThreadCardData = Prisma.ThreadGetPayload<{ include: typeof threadListInclude }>;

export function ThreadCard({ thread }: { thread: ThreadCardData }) {
  const preview = excerpt(thread.body);
  return (
    <article className="card card-hover p-5 sm:p-6">
      <div className="flex gap-3">
        <Link href={`/members/${thread.author.id}`} className="shrink-0" aria-hidden tabIndex={-1}>
          <Avatar src={thread.author.imageUrl} name={thread.author.displayName} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 muted">
            <Link href={`/members/${thread.author.id}`} className="font-bold hover:underline" style={{ color: "var(--foreground)" }}>
              {thread.author.displayName}
            </Link>
            <UserRoleBadge role={thread.author.role} />
            <span className="hidden sm:inline" aria-hidden>·</span>
            <span>in</span>
            <Link href={`/c/${thread.category.slug}`} className="font-bold hover:underline" style={{ color: thread.category.color }}>
              {thread.category.name}
            </Link>
            <PostingPolicyBadge policy={thread.category.postingPolicy} />
            <span aria-hidden>·</span>
            <time dateTime={thread.createdAt.toISOString()}>{formatDistanceToNow(thread.createdAt, { addSuffix: true })}</time>
            {thread.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
                <Pin size={11} aria-hidden /> Pinned
              </span>
            )}
          </div>
          <Link href={`/t/${thread.slug}`} className="group block">
            <h2 className="flex items-start gap-2 text-[1.05rem] font-extrabold leading-snug tracking-tight group-hover:text-[var(--brand-dark)] sm:text-xl">
              <span className="min-w-0">{thread.title}</span>
            </h2>
            {preview ? <p className="mt-2 line-clamp-2 text-sm leading-6 muted">{preview}</p> : null}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {thread.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {thread.tags.map(({ tag }) => (
                  <Link key={tag.id} href={`/tag/${tag.slug}`} className="pill hover:border-[var(--line-soft)] hover:bg-[var(--surface-hover)]">
                    #{tag.name}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-3 text-xs font-semibold muted">
              <span className="inline-flex items-center gap-1.5" aria-label={`${thread._count.upvotes} upvotes`}>
                <ArrowUp size={14} aria-hidden />{thread._count.upvotes}
              </span>
              <span className="inline-flex items-center gap-1.5" aria-label={`${thread._count.dislikes} dislikes`}>
                <ArrowDown size={14} aria-hidden />{thread._count.dislikes}
              </span>
              <span className="inline-flex items-center gap-1.5" aria-label={`${thread._count.replies} replies`}>
                <MessageCircle size={14} aria-hidden />{thread._count.replies}
              </span>
              <span className="hidden items-center gap-1.5 sm:inline-flex" aria-label={`${thread._count.bookmarks} bookmarks`}>
                <Bookmark size={14} aria-hidden />{thread._count.bookmarks}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
