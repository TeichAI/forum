import Link from "next/link";
import { Bookmark, MessageCircle, Pin, ThumbsUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Prisma } from "@prisma/client";
import { threadListInclude } from "@/lib/queries";
import { excerpt } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { PostingPolicyBadge } from "@/components/forum/space-posting-policy";
import { UserRoleBadge } from "@/components/ui/user-role-badge";

type ThreadCardData = Prisma.ThreadGetPayload<{ include: typeof threadListInclude }>;

export function ThreadCard({ thread }: { thread: ThreadCardData }) {
  return (
    <article className="card card-hover p-5 sm:p-6">
      <div className="flex gap-3">
        <Link href={`/members/${thread.author.id}`}><Avatar src={thread.author.imageUrl} name={thread.author.displayName} /></Link>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs muted">
            <Link href={`/members/${thread.author.id}`} className="font-bold" style={{ color: "var(--foreground)" }}>{thread.author.displayName}</Link>
            <UserRoleBadge role={thread.author.role} />
            <span>in</span>
            <Link href={`/c/${thread.category.slug}`} className="font-bold" style={{ color: thread.category.color }}>{thread.category.name}</Link>
            <PostingPolicyBadge policy={thread.category.postingPolicy} />
            <span>·</span><time>{formatDistanceToNow(thread.createdAt, { addSuffix: true })}</time>
          </div>
          <Link href={`/t/${thread.slug}`}>
            <h2 className="flex items-center gap-2 text-lg font-extrabold leading-snug sm:text-xl">{thread.isPinned && <Pin size={15} style={{ color: "var(--brand)" }} />}{thread.title}</h2>
            <p className="mt-2 text-sm leading-6 muted">{excerpt(thread.body)}</p>
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {thread.tags.map(({ tag }) => <Link key={tag.id} href={`/tag/${tag.slug}`} className="pill">#{tag.name}</Link>)}
            <div className="ml-auto flex items-center gap-3 text-xs font-semibold muted">
              <span className="flex items-center gap-1"><ThumbsUp size={14} />{thread._count.votes}</span>
              <span className="flex items-center gap-1"><MessageCircle size={14} />{thread._count.replies}</span>
              <span className="desktop-only flex items-center gap-1"><Bookmark size={14} />{thread._count.bookmarks}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
