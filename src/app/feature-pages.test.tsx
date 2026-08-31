import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(), requireUser: vi.fn(), requireModerator: vi.fn(), notFound: vi.fn(), redirect: vi.fn(), listThreads: vi.fn(),
  thread: vi.fn(), user: vi.fn(), notifications: vi.fn(), reports: vi.fn(), actions: vi.fn(),
  notificationUpdate: vi.fn(),
  replies: vi.fn(),
  pollAccess: vi.fn(), pollSnapshot: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer, requireUser: mocks.requireUser, requireModerator: mocks.requireModerator }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/queries", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/queries")>(),
  listThreadsPage: mocks.listThreads,
  canModerate: (user: { role?: string } | null) => user?.role === "MODERATOR" || user?.role === "ADMIN",
}));
vi.mock("@/lib/db", () => ({ db: {
  thread: { findUnique: mocks.thread, findFirst: mocks.thread }, user: { findUnique: mocks.user, findFirst: mocks.user },
  notification: { findMany: mocks.notifications, updateMany: mocks.notificationUpdate }, report: { findMany: mocks.reports },
  moderationAction: { findMany: mocks.actions },
} }));
vi.mock("@/lib/reply-pagination", () => ({ REPLY_BRANCH_PAGE_SIZE: 100, listReplyBranches: mocks.replies }));
vi.mock("@/lib/poll-access", () => ({ canAccessPollThread: mocks.pollAccess }));
vi.mock("@/lib/poll-data", () => ({ getPollSnapshot: mocks.pollSnapshot }));
vi.mock("@/components/forum/poll-card", () => ({ PollCard: ({ initialPoll }: { initialPoll: { question: string } }) => <section>{initialPoll.question}</section> }));
vi.mock("@/components/markdown", () => ({ Markdown: ({ children }: { children: string }) => <div>{children}</div> }));
vi.mock("@/components/markdown-editor", () => ({ MarkdownEditor: () => <textarea aria-label="Editor" /> }));
vi.mock("@/components/markdown-editor-client", () => ({ MarkdownEditorClient: ({ placeholder }: { placeholder: string }) => <textarea name="body" placeholder={placeholder} /> }));
vi.mock("@/components/forum/thread-card", () => ({ ThreadCard: ({ thread }: { thread: { title: string } }) => <article>{thread.title}</article> }));
vi.mock("@/components/forum/report-form", () => ({ ReportForm: ({ targetType }: { targetType: string }) => <button>{`Report ${targetType}`}</button> }));
vi.mock("@/components/forum/content-menu", () => ({ ContentMenu: ({ type }: { type: string }) => <button>{`Edit ${type}`}</button> }));
vi.mock("@/components/ui/avatar", () => ({ Avatar: ({ name }: { name: string }) => <span>{`Avatar ${name}`}</span> }));
vi.mock("@/components/ui/submit-button", () => ({
  SubmitButton: ({ children, pendingLabel, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) => <button data-pending-label={pendingLabel} {...props}>{children}</button>,
}));

import MemberPage, { generateMetadata as memberMetadata } from "./members/[id]/page";
import ModerationPage from "./moderation/page";
import NotificationsPage from "./notifications/page";
import ThreadPage, { generateMetadata as threadMetadata } from "./t/[slug]/page";

const now = new Date("2026-08-24T12:00:00Z");
const member = { id: "member", username: "member", displayName: "Member", imageUrl: null, role: "MEMBER", status: "ACTIVE", bio: "About member", createdAt: now };
const other = { id: "other", username: "other", displayName: "Other", imageUrl: null, role: "MEMBER", status: "ACTIVE", bio: "", createdAt: now };
const admin = { ...member, id: "admin", username: "admin", displayName: "Admin", role: "ADMIN" };
const thread = {
  id: "thread", slug: "topic", title: "A full discussion", body: "Thread body", status: "PUBLISHED", authorId: member.id,
  author: member, category: { id: "category", slug: "general", name: "General", color: "#123456", postingPolicy: "OPEN" }, tags: [{ tag: { id: "tag", slug: "testing", name: "Testing" } }],
  upvotes: [], dislikes: [], bookmarks: [], _count: { upvotes: 2, dislikes: 1, replies: 1 }, isLocked: false, createdAt: now, editedAt: null,
  replies: [{ id: "reply", body: "Reply body", status: "PUBLISHED", parentReplyId: null, authorId: other.id, author: { ...other, role: "MODERATOR" }, upvotes: [], dislikes: [], _count: { upvotes: 1, dislikes: 2 }, createdAt: now, editedAt: now }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  mocks.listThreads.mockResolvedValue({ items: [], nextCursor: null });
  mocks.replies.mockResolvedValue({ items: thread.replies, nextCursor: null, continuations: [], selectedBranchId: null });
  mocks.notificationUpdate.mockReturnValue(Promise.resolve({ count: 0 }));
  mocks.pollAccess.mockResolvedValue(true);
  mocks.pollSnapshot.mockResolvedValue(null);
});

describe("discussion page", () => {
  it("generates fallback and populated metadata", async () => {
    mocks.thread.mockResolvedValueOnce({ title: "Topic", body: "Long **description**", slug: "topic", createdAt: now, updatedAt: now, author: { displayName: "Member" }, category: { name: "General" }, tags: [{ tag: { name: "Testing" } }] }).mockResolvedValueOnce(null);
    await expect(threadMetadata({ params: Promise.resolve({ slug: "topic" }) })).resolves.toEqual(expect.objectContaining({ title: "Topic", description: "Long description", alternates: { canonical: "http://localhost:3000/t/topic" }, openGraph: expect.objectContaining({ type: "article", publishedTime: now.toISOString(), tags: ["Testing"] }) }));
    await expect(threadMetadata({ params: Promise.resolve({ slug: "missing" }) })).resolves.toEqual({ title: "Content unavailable", description: "This content is unavailable.", robots: { index: false, follow: false } });
  });

  it("renders a populated signed-out discussion and reply prompt accessibly", async () => {
    mocks.viewer.mockResolvedValue(null);
    mocks.thread.mockResolvedValue(thread);
    const { container } = render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByRole("heading", { name: "A full discussion" })).toBeInTheDocument();
    expect(screen.getByText("Thread body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upvote thread, 2 upvotes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Upvote thread, 2 upvotes" })).toHaveClass("button-ghost");
    expect(screen.getByRole("button", { name: "Dislike thread, 1 dislike" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dislike thread, 1 dislike" })).toHaveClass("button-ghost");
    expect(screen.getByRole("button", { name: "Upvote reply 1, 1 upvote" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dislike reply 1, 2 dislikes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("link", { name: "Sign in to reply" })).toBeInTheDocument();
    expect(screen.queryByText("Edit thread")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders member ownership, saved/reaction states, and reply controls", async () => {
    mocks.viewer.mockResolvedValue(member);
    const savedThread = {
      ...thread,
      upvotes: [{}],
      bookmarks: [{}],
      replies: [{ ...thread.replies[0], dislikes: [{}] }],
    };
    mocks.thread.mockResolvedValue(savedThread);
    mocks.replies.mockResolvedValue({ items: savedThread.replies, nextCursor: null, continuations: [], selectedBranchId: null });
    render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upvote thread, 2 upvotes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Upvote thread, 2 upvotes" })).toHaveClass("button-primary");
    expect(screen.getByRole("button", { name: "Dislike thread, 1 dislike" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dislike reply 1, 2 dislikes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dislike reply 1, 2 dislikes" })).toHaveClass("button-danger");
    expect(screen.getByText("Edit thread")).toBeInTheDocument();
    expect(screen.getByText("Report THREAD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reply to Other" })).toBeInTheDocument();
  });

  it("shows locked staff controls and allows staff to inspect hidden content", async () => {
    mocks.viewer.mockResolvedValue(admin);
    mocks.thread.mockResolvedValue({ ...thread, status: "HIDDEN", isLocked: true });
    render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByText("This discussion is locked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
    expect(screen.queryByText("Edit reply")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply to Other" })).not.toBeInTheDocument();
  });

  it("does not read a hidden poll snapshot when live staff verification fails", async () => {
    mocks.viewer.mockResolvedValue(admin);
    mocks.pollAccess.mockResolvedValue(false);
    mocks.thread.mockResolvedValue({ ...thread, status: "HIDDEN", poll: { id: "poll" } });
    render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(mocks.pollAccess).toHaveBeenCalled();
    expect(mocks.pollSnapshot).not.toHaveBeenCalled();
  });

  it("replaces replies with an admin-only notice while keeping thread locks absolute", async () => {
    mocks.viewer.mockResolvedValue({ ...member, role: "MODERATOR" });
    const nestedThread = {
      ...thread,
      category: { ...thread.category, postingPolicy: "ADMIN_ONLY" },
    };
    mocks.thread.mockResolvedValue(nestedThread);
    mocks.replies.mockResolvedValue({ items: nestedThread.replies, nextCursor: null, continuations: [], selectedBranchId: null });
    const { rerender } = render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByLabelText("Admin only")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Replies are limited to admins" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post reply" })).not.toBeInTheDocument();

    mocks.thread.mockResolvedValue({
      ...thread,
      isLocked: true,
      category: { ...thread.category, postingPolicy: "ADMIN_ONLY" },
    });
    rerender(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByText("This discussion is locked.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Replies are limited to admins" })).not.toBeInTheDocument();
  });

  it("allows members to reply to announcements and admins to reply everywhere", async () => {
    mocks.viewer.mockResolvedValue(member);
    mocks.thread.mockResolvedValue({
      ...thread,
      category: { ...thread.category, postingPolicy: "ANNOUNCEMENTS" },
    });
    const { rerender } = render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByLabelText("Announcements")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post reply" })).toBeInTheDocument();

    mocks.viewer.mockResolvedValue(admin);
    mocks.thread.mockResolvedValue({
      ...thread,
      category: { ...thread.category, postingPolicy: "ADMIN_ONLY" },
    });
    rerender(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByRole("button", { name: "Post reply" })).toBeInTheDocument();
  });

  it("returns not found for missing content and hidden content viewed by members", async () => {
    mocks.viewer.mockResolvedValue(member);
    mocks.thread.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...thread, status: "HIDDEN" });
    await expect(ThreadPage({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(ThreadPage({ params: Promise.resolve({ slug: "topic" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders nested branches, stable anchors, parent labels, and removed-parent placeholders", async () => {
    mocks.viewer.mockResolvedValue(null);
    const nestedThread = {
      ...thread,
      _count: { ...thread._count, replies: 2 },
      replies: [
        { ...thread.replies[0], id: "deleted-parent", body: "Secret deleted body", status: "DELETED", author: other },
        { ...thread.replies[0], id: "nested", body: "Visible descendant", status: "PUBLISHED", parentReplyId: "deleted-parent", author: member, authorId: member.id },
        { ...thread.replies[0], id: "hidden", body: "Secret hidden body", status: "HIDDEN", parentReplyId: "nested", author: other },
      ],
    };
    mocks.thread.mockResolvedValue(nestedThread);
    mocks.replies.mockResolvedValue({ items: nestedThread.replies, nextCursor: null, continuations: [], selectedBranchId: null });

    render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByText("Reply deleted")).toBeInTheDocument();
    expect(screen.getByText("Reply unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Secret deleted body")).not.toBeInTheDocument();
    expect(screen.queryByText("Secret hidden body")).not.toBeInTheDocument();
    expect(screen.getByText("Visible descendant")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Replying to Other" })).toHaveAttribute("href", "#reply-deleted-parent");
    expect(document.querySelector("#reply-nested")).toBeInTheDocument();
    expect(document.querySelector('[data-depth="2"]')).toHaveAttribute("data-indent-mobile", "2");
  });

  it("links to reply branch and root continuations", async () => {
    mocks.viewer.mockResolvedValue(null);
    mocks.thread.mockResolvedValue(thread);
    mocks.replies.mockResolvedValue({
      items: thread.replies,
      nextCursor: "next roots",
      continuations: [{ rootId: "reply", page: 1 }],
      selectedBranchId: "reply",
    });

    render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));

    expect(screen.getByRole("link", { name: "Continue this branch" })).toHaveAttribute("href", "/t/topic?branch=reply&branchPage=1");
    expect(screen.getByRole("link", { name: "More reply branches" })).toHaveAttribute("href", "/t/topic?replyCursor=next%20roots");
    expect(screen.getByRole("link", { name: "Back to reply branches" })).toHaveAttribute("href", "/t/topic#replies");
  });
});

describe("member profile", () => {
  it("generates metadata and renders member actions without role-management controls", async () => {
    mocks.user.mockResolvedValue({ ...other, _count: { followers: 2, following: 3, threads: 4, replies: 5 }, followers: [] });
    await expect(memberMetadata({ params: Promise.resolve({ id: "other" }) })).resolves.toEqual(expect.objectContaining({ title: "Other", alternates: { canonical: "http://localhost:3000/members/other" }, robots: { index: false, follow: true } }));
    mocks.viewer.mockResolvedValue(admin);
    mocks.listThreads.mockResolvedValue({ items: [{ id: "thread", title: "Recent topic" }], nextCursor: null });
    render(await MemberPage({ params: Promise.resolve({ id: "other" }) }));
    expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mail" })).toHaveAttribute("href", "/mail/compose?to=other");
    expect(screen.queryByRole("button", { name: "Update role" })).not.toBeInTheDocument();
    expect(screen.getByText("Recent topic")).toBeInTheDocument();
    const profileQuery = mocks.user.mock.calls.at(-1)?.[0];
    expect(profileQuery).toEqual(expect.objectContaining({
      where: { id: "other", status: "ACTIVE" },
      select: expect.objectContaining({ id: true, username: true, displayName: true, imageUrl: true, bio: true, role: true }),
    }));
    expect(profileQuery.select).not.toHaveProperty("email");
    expect(profileQuery.select).not.toHaveProperty("clerkId");
    expect(profileQuery.select).not.toHaveProperty("suspendedUntil");
    expect(profileQuery.select).not.toHaveProperty("suspensionReason");
  });

  it("keeps anonymous attribution profiles public while hiding member-only facts and private sentinels", async () => {
    mocks.viewer.mockResolvedValue(null);
    mocks.user.mockResolvedValue({
      ...other,
      bio: "Public biography",
      email: "PRIVATE_EMAIL_SENTINEL",
      clerkId: "PRIVATE_CLERK_SENTINEL",
      suspensionReason: "PRIVATE_MODERATION_SENTINEL",
      _count: { followers: 22, following: 33 },
      followers: [],
    });
    mocks.listThreads.mockResolvedValue({ items: [{ id: "thread", title: "Public topic" }], nextCursor: null });
    const element = await MemberPage({ params: Promise.resolve({ id: "other" }) });
    expect(JSON.stringify(element)).not.toMatch(/PRIVATE_(EMAIL|CLERK|MODERATION)_SENTINEL/);
    render(element);
    expect(screen.getByRole("heading", { name: "Other" })).toBeInTheDocument();
    expect(screen.getByText("Public biography")).toBeInTheDocument();
    expect(screen.getByText("Public topic")).toBeInTheDocument();
    expect(screen.queryByText(/followers|following|Joined/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Follow/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mail" })).not.toBeInTheDocument();
  });

  it("renders own profile and empty activity", async () => {
    mocks.viewer.mockResolvedValue(member);
    mocks.user.mockResolvedValue({ ...member, _count: { followers: 0, following: 0, threads: 0, replies: 0 }, followers: [] });
    render(await MemberPage({ params: Promise.resolve({ id: "member" }) }));
    expect(screen.getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", "/settings");
    expect(screen.getByText("No public discussions yet.")).toBeInTheDocument();
  });

  it("uses fallback metadata and rejects missing or deleted members", async () => {
    mocks.user.mockResolvedValueOnce(null);
    await expect(memberMetadata({ params: Promise.resolve({ id: "missing" }) })).resolves.toEqual({ title: "Content unavailable", description: "This content is unavailable.", robots: { index: false, follow: false } });
    mocks.viewer.mockResolvedValue(null);
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(MemberPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(MemberPage({ params: Promise.resolve({ id: "member" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.user).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "member", status: "ACTIVE" } }));
  });
});

describe("notification and moderation pages", () => {
  it("renders notification destinations, unread state, and mark-all action", async () => {
    mocks.requireUser.mockResolvedValue(member);
    mocks.notifications.mockResolvedValue([
      { id: "reply", type: "REPLY", conversationId: null, thread: { slug: "topic", title: "Topic" }, reply: { parentReplyId: null }, replyId: "reply", actor: other, readAt: now, createdAt: now },
      { id: "nested-reply", type: "REPLY", conversationId: null, thread: { slug: "topic", title: "Topic" }, reply: { parentReplyId: "parent" }, replyId: "nested", actor: other, readAt: now, createdAt: now },
      { id: "system", type: "MODERATION", thread: null, replyId: null, actor: null, readAt: null, createdAt: now },
    ]);
    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("button", { name: /Mark all read/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /replied to your discussion/ })).toHaveAttribute("href", "/t/topic#reply-reply");
    expect(screen.getByRole("link", { name: /replied to your reply/ })).toHaveAttribute("href", "/t/topic#reply-nested");
    expect(screen.getByRole("link", { name: /moderation update/ })).toHaveAttribute("href", "/notifications");
  });

  it("renders empty notifications without mark-all", async () => {
    mocks.requireUser.mockResolvedValue(member);
    mocks.notifications.mockResolvedValue([]);
    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("You are all caught up")).toBeInTheDocument();
    expect(screen.queryByText(/Mark all read/)).not.toBeInTheDocument();
  });

  it("redirects the legacy moderation page into the staff console", async () => {
    mocks.requireModerator.mockResolvedValue(admin);
    await expect(ModerationPage()).rejects.toThrow("redirect:/staff/reports");
    expect(mocks.requireModerator).toHaveBeenCalledOnce();
  });
});
