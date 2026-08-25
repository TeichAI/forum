import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Bookmark, Lock, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { createReply, toggleBookmark, toggleReplyReaction, toggleThreadLock, toggleThreadReaction } from "@/actions/forum";
import { ContentMenu } from "@/components/forum/content-menu";
import { NestedReplyComposer, NestedReplyControl, ReplyComposerProvider } from "@/components/forum/nested-reply-composer";
import { ReportForm } from "@/components/forum/report-form";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { RateLimitForm } from "@/components/ui/rate-limit-form";
import { PostingPolicyBadge } from "@/components/forum/space-posting-policy";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { canModerate } from "@/lib/queries";
import { buildReplyTree, flattenReplyTree, replyIndentLevels } from "@/lib/reply-tree";
import { canComment } from "@/lib/space-posting-permissions";
import { uploadsEnabled } from "@/lib/upload-capability";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const thread = await db.thread.findUnique({
    where: { slug },
    select: { title: true, body: true },
  });
  return { title: thread?.title ?? "Discussion", description: thread?.body.slice(0, 150) };
}

export default async function ThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  const thread = await db.thread.findUnique({
    where: { slug },
    include: {
      author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } },
      category: true,
      tags: { include: { tag: true } },
      upvotes: viewer ? { where: { userId: viewer.id } } : false,
      dislikes: viewer ? { where: { userId: viewer.id } } : false,
      bookmarks: viewer ? { where: { userId: viewer.id } } : false,
      _count: { select: { upvotes: true, dislikes: true, replies: { where: { status: "PUBLISHED" } } } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } },
          upvotes: viewer ? { where: { userId: viewer.id } } : false,
          dislikes: viewer ? { where: { userId: viewer.id } } : false,
          _count: { select: { upvotes: true, dislikes: true } },
        },
      },
    },
  });
  if (!thread || ((thread.status !== "PUBLISHED" || thread.category.archivedAt) && !canModerate(viewer))) notFound();

  const returnTo = `/t/${thread.slug}`;
  const displayReplies = flattenReplyTree(buildReplyTree(thread.replies));
  const canViewerReply = Boolean(
    viewer
    && thread.status === "PUBLISHED"
    && !thread.category.archivedAt
    && !thread.isLocked
    && canComment(viewer.role, thread.category.postingPolicy),
  );
  const replyUploadsEnabled = uploadsEnabled();
  const showPolicyReplyNotice = thread.category.postingPolicy === "ADMIN_ONLY"
    && !canComment(viewer?.role, thread.category.postingPolicy);

  return (
    <div className="shell max-w-4xl py-8">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm muted">
        <Link href={`/c/${thread.category.slug}`} className="font-bold" style={{ color: thread.category.color }}>
          {thread.category.name}
        </Link>
        {thread.category.postingPolicy !== "OPEN" ? <PostingPolicyBadge policy={thread.category.postingPolicy} /> : null}
        <span>/</span>
        <span>Discussion</span>
      </div>

      <article className="card">
        <header className="border-b p-5 sm:p-8" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-start gap-3">
            <Link href={`/members/${thread.author.id}`}>
              <Avatar src={thread.author.imageUrl} name={thread.author.displayName} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/members/${thread.author.id}`} className="font-extrabold">{thread.author.displayName}</Link>
                <UserRoleBadge role={thread.author.role} />
                <span className="muted">
                  · {formatDistanceToNow(thread.createdAt, { addSuffix: true })}{thread.editedAt ? " · edited" : ""}
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-black leading-tight sm:text-4xl">{thread.title}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {thread.tags.map(({ tag }) => <Link href={`/tag/${tag.slug}`} key={tag.id} className="pill">#{tag.name}</Link>)}
              </div>
            </div>
          </div>
        </header>
        <div className="p-5 sm:p-8"><Markdown>{thread.body}</Markdown></div>
        <footer
          className="flex flex-wrap items-center gap-2 rounded-b-[17px] border-t px-5 py-3 sm:px-8"
          style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}
        >
          <RateLimitForm action={toggleThreadReaction}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="reaction" value="UPVOTE" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton
              className={`button ${thread.upvotes?.length ? "button-primary" : "button-ghost"}`}
              pendingLabel="Updating…"
              aria-label={`Upvote thread, ${thread._count.upvotes} ${thread._count.upvotes === 1 ? "upvote" : "upvotes"}`}
              aria-pressed={Boolean(thread.upvotes?.length)}
            >
              <ArrowUp size={16} aria-hidden /> {thread._count.upvotes}
            </SubmitButton>
          </RateLimitForm>
          <RateLimitForm action={toggleThreadReaction}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="reaction" value="DISLIKE" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton
              className={`button ${thread.dislikes?.length ? "button-danger" : "button-ghost"}`}
              pendingLabel="Updating…"
              aria-label={`Dislike thread, ${thread._count.dislikes} ${thread._count.dislikes === 1 ? "dislike" : "dislikes"}`}
              aria-pressed={Boolean(thread.dislikes?.length)}
            >
              <ArrowDown size={16} aria-hidden /> {thread._count.dislikes}
            </SubmitButton>
          </RateLimitForm>
          <span className="button button-ghost"><MessageCircle size={16} /> {thread._count.replies}</span>
          <RateLimitForm action={toggleBookmark}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton className={`button ${thread.bookmarks?.length ? "button-secondary" : "button-ghost"}`} pendingLabel="Updating…">
              <Bookmark size={16} /> {thread.bookmarks?.length ? "Saved" : "Save"}
            </SubmitButton>
          </RateLimitForm>
          <div className="ml-auto flex items-center gap-3">
            {viewer?.id === thread.authorId ? (
              <ContentMenu type="thread" id={thread.id} title={thread.title} body={thread.body} />
            ) : null}
            {viewer ? <ReportForm targetType="THREAD" targetId={thread.id} returnTo={returnTo} /> : null}
            {canModerate(viewer) ? (
              <RateLimitForm action={toggleThreadLock}>
                <input type="hidden" name="threadId" value={thread.id} />
                <SubmitButton className="button button-ghost" pendingLabel="Updating…"><Lock size={15} /> {thread.isLocked ? "Unlock" : "Lock"}</SubmitButton>
              </RateLimitForm>
            ) : null}
          </div>
        </footer>
      </article>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-black">
          {thread._count.replies} {thread._count.replies === 1 ? "reply" : "replies"}
        </h2>
        <ReplyComposerProvider>
          <div className="space-y-3">
            {displayReplies.map(({ reply, parentReply, depth }, index) => {
              const indent = replyIndentLevels(depth);
              return (
                <div
                  key={reply.id}
                  className="reply-branch"
                  data-depth={depth}
                  data-indent-desktop={indent.desktop}
                  data-indent-mobile={indent.mobile}
                  style={{ "--reply-depth-desktop": indent.desktop, "--reply-depth-mobile": indent.mobile } as React.CSSProperties}
                >
                  <article id={`reply-${reply.id}`} className="card scroll-mt-24 p-5 sm:p-6">
                    {reply.status === "PUBLISHED" ? (
                      <div className="flex gap-3">
                        <Link href={`/members/${reply.author.id}`}>
                          <Avatar src={reply.author.imageUrl} name={reply.author.displayName} />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Link href={`/members/${reply.author.id}`} className="font-extrabold">{reply.author.displayName}</Link>
                            <UserRoleBadge role={reply.author.role} />
                            <span className="muted">
                              · {formatDistanceToNow(reply.createdAt, { addSuffix: true })}{reply.editedAt ? " · edited" : ""}
                            </span>
                            <a href={`#reply-${reply.id}`} className="ml-auto text-xs muted">#{index + 1}</a>
                          </div>
                          {parentReply ? (
                            <a href={`#reply-${parentReply.id}`} className="mt-2 inline-block text-xs font-semibold muted">
                              Replying to {parentReply.author.displayName}
                            </a>
                          ) : null}
                          <div className="mt-4"><Markdown>{reply.body}</Markdown></div>
                          <div className="mt-5 flex flex-wrap items-center gap-3">
                            <RateLimitForm action={toggleReplyReaction}>
                              <input type="hidden" name="replyId" value={reply.id} />
                              <input type="hidden" name="reaction" value="UPVOTE" />
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <SubmitButton
                                className={`button !min-h-0 !px-2.5 !py-1.5 ${reply.upvotes?.length ? "button-primary" : "button-ghost"}`}
                                pendingLabel="Updating…"
                                aria-label={`Upvote reply ${index + 1}, ${reply._count.upvotes} ${reply._count.upvotes === 1 ? "upvote" : "upvotes"}`}
                                aria-pressed={Boolean(reply.upvotes?.length)}
                              >
                                <ArrowUp size={14} aria-hidden /> {reply._count.upvotes}
                              </SubmitButton>
                            </RateLimitForm>
                            <RateLimitForm action={toggleReplyReaction}>
                              <input type="hidden" name="replyId" value={reply.id} />
                              <input type="hidden" name="reaction" value="DISLIKE" />
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <SubmitButton
                                className={`button !min-h-0 !px-2.5 !py-1.5 ${reply.dislikes?.length ? "button-danger" : "button-ghost"}`}
                                pendingLabel="Updating…"
                                aria-label={`Dislike reply ${index + 1}, ${reply._count.dislikes} ${reply._count.dislikes === 1 ? "dislike" : "dislikes"}`}
                                aria-pressed={Boolean(reply.dislikes?.length)}
                              >
                                <ArrowDown size={14} aria-hidden /> {reply._count.dislikes}
                              </SubmitButton>
                            </RateLimitForm>
                            {canViewerReply ? <NestedReplyControl replyId={reply.id} authorName={reply.author.displayName} /> : null}
                            {viewer?.id === reply.authorId ? (
                              <ContentMenu type="reply" id={reply.id} body={reply.body} />
                            ) : null}
                            {viewer ? <ReportForm targetType="REPLY" targetId={reply.id} returnTo={returnTo} /> : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 py-2">
                        <p className="font-bold muted">{reply.status === "DELETED" ? "Reply deleted" : "Reply unavailable"}</p>
                        <span className="text-xs muted">#{index + 1}</span>
                      </div>
                    )}
                  </article>
                  {reply.status === "PUBLISHED" && canViewerReply ? (
                    <NestedReplyComposer threadId={thread.id} parentReplyId={reply.id} authorName={reply.author.displayName} uploadsEnabled={replyUploadsEnabled} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </ReplyComposerProvider>
      </section>

      <section className="card mt-7 p-5 sm:p-7">
        {thread.category.archivedAt ? (
          <div className="flex items-center gap-2 font-bold muted"><Lock size={18} /> This space is archived. Staff may preview it, but posting is disabled.</div>
        ) : thread.isLocked ? (
          <div className="flex items-center gap-2 font-bold muted">
            <Lock size={18} /> This discussion is locked.
          </div>
        ) : showPolicyReplyNotice ? (
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 shrink-0" size={18} />
            <div>
              <h2 className="font-black">Replies are limited to admins</h2>
              <p className="mt-1 text-sm leading-6 muted">Only admins can reply in this space. Existing discussions and replies remain available to read.</p>
            </div>
          </div>
        ) : viewer ? (
          <>
            <h2 className="mb-4 text-lg font-black">Join the conversation</h2>
            <RateLimitForm action={createReply}>
              <input type="hidden" name="threadId" value={thread.id} />
              <MarkdownEditor rows={6} placeholder="Write a thoughtful reply…" />
              <div className="mt-4 flex justify-end">
                <SubmitButton pendingLabel="Posting…">Post reply</SubmitButton>
              </div>
            </RateLimitForm>
          </>
        ) : (
          <div className="text-center">
            <h2 className="text-lg font-black">Have something to add?</h2>
            <p className="mb-4 mt-1 muted">Sign in to join this conversation.</p>
            <Link href="/sign-in" className="button button-primary">Sign in to reply</Link>
          </div>
        )}
      </section>
    </div>
  );
}
