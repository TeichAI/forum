import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(), requireUser: vi.fn(), requireModerator: vi.fn(), notFound: vi.fn(), redirect: vi.fn(), listThreads: vi.fn(),
  thread: vi.fn(), user: vi.fn(), conversation: vi.fn(), transaction: vi.fn(), notifications: vi.fn(), reports: vi.fn(), actions: vi.fn(),
  messageUpdate: vi.fn(), notificationUpdate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer, requireUser: mocks.requireUser, requireModerator: mocks.requireModerator }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/queries", () => ({ listThreads: mocks.listThreads, canModerate: (user: { role?: string } | null) => user?.role === "MODERATOR" || user?.role === "ADMIN" }));
vi.mock("@/lib/db", () => ({ db: {
  thread: { findUnique: mocks.thread }, user: { findUnique: mocks.user }, conversation: { findUnique: mocks.conversation },
  notification: { findMany: mocks.notifications, updateMany: mocks.notificationUpdate }, report: { findMany: mocks.reports },
  moderationAction: { findMany: mocks.actions }, message: { updateMany: mocks.messageUpdate }, $transaction: mocks.transaction,
} }));
vi.mock("@/components/markdown", () => ({ Markdown: ({ children }: { children: string }) => <div>{children}</div> }));
vi.mock("@/components/markdown-editor", () => ({ MarkdownEditor: () => <textarea aria-label="Editor" /> }));
vi.mock("@/components/forum/thread-card", () => ({ ThreadCard: ({ thread }: { thread: { title: string } }) => <article>{thread.title}</article> }));
vi.mock("@/components/forum/report-form", () => ({ ReportForm: ({ targetType }: { targetType: string }) => <button>{`Report ${targetType}`}</button> }));
vi.mock("@/components/forum/content-menu", () => ({ ContentMenu: ({ type }: { type: string }) => <button>{`Edit ${type}`}</button> }));
vi.mock("@/components/ui/avatar", () => ({ Avatar: ({ name }: { name: string }) => <span>{`Avatar ${name}`}</span> }));
vi.mock("@/components/ui/submit-button", () => ({ SubmitButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button> }));

import ConversationPage from "./messages/[id]/page";
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
  votes: [], bookmarks: [], _count: { votes: 2, replies: 1 }, isLocked: false, createdAt: now, editedAt: null,
  replies: [{ id: "reply", body: "Reply body", authorId: other.id, author: { ...other, role: "MODERATOR" }, votes: [], _count: { votes: 1 }, createdAt: now, editedAt: now }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  mocks.listThreads.mockResolvedValue([]);
  mocks.transaction.mockResolvedValue([]);
  mocks.messageUpdate.mockReturnValue(Promise.resolve({ count: 0 }));
  mocks.notificationUpdate.mockReturnValue(Promise.resolve({ count: 0 }));
});

describe("discussion page", () => {
  it("generates fallback and populated metadata", async () => {
    mocks.thread.mockResolvedValueOnce({ title: "Topic", body: "Long description" }).mockResolvedValueOnce(null);
    await expect(threadMetadata({ params: Promise.resolve({ slug: "topic" }) })).resolves.toEqual({ title: "Topic", description: "Long description" });
    await expect(threadMetadata({ params: Promise.resolve({ slug: "missing" }) })).resolves.toEqual({ title: "Discussion", description: undefined });
  });

  it("renders a populated signed-out discussion and reply prompt accessibly", async () => {
    mocks.viewer.mockResolvedValue(null);
    mocks.thread.mockResolvedValue(thread);
    const { container } = render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByRole("heading", { name: "A full discussion" })).toBeInTheDocument();
    expect(screen.getByText("Thread body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to reply" })).toBeInTheDocument();
    expect(screen.queryByText("Edit thread")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders member ownership, saved/voted state, and reply controls", async () => {
    mocks.viewer.mockResolvedValue(member);
    mocks.thread.mockResolvedValue({ ...thread, votes: [{}], bookmarks: [{}] });
    render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Edit thread")).toBeInTheDocument();
    expect(screen.getByText("Report THREAD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post reply" })).toBeInTheDocument();
  });

  it("shows locked staff controls and allows staff to inspect hidden content", async () => {
    mocks.viewer.mockResolvedValue(admin);
    mocks.thread.mockResolvedValue({ ...thread, status: "HIDDEN", isLocked: true });
    render(await ThreadPage({ params: Promise.resolve({ slug: "topic" }) }));
    expect(screen.getByText("This discussion is locked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
    expect(screen.queryByText("Edit reply")).not.toBeInTheDocument();
  });

  it("replaces replies with an admin-only notice while keeping thread locks absolute", async () => {
    mocks.viewer.mockResolvedValue({ ...member, role: "MODERATOR" });
    mocks.thread.mockResolvedValue({
      ...thread,
      category: { ...thread.category, postingPolicy: "ADMIN_ONLY" },
    });
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
});

describe("member profile", () => {
  it("generates metadata and renders member actions without role-management controls", async () => {
    mocks.user.mockResolvedValue({ ...other, _count: { followers: 2, following: 3, threads: 4, replies: 5 }, followers: [] });
    await expect(memberMetadata({ params: Promise.resolve({ id: "other" }) })).resolves.toEqual({ title: "Other" });
    mocks.viewer.mockResolvedValue(admin);
    mocks.listThreads.mockResolvedValue([{ id: "thread", title: "Recent topic" }]);
    render(await MemberPage({ params: Promise.resolve({ id: "other" }) }));
    expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Message" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update role" })).not.toBeInTheDocument();
    expect(screen.getByText("Recent topic")).toBeInTheDocument();
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
    await expect(memberMetadata({ params: Promise.resolve({ id: "missing" }) })).resolves.toEqual({ title: "Member" });
    mocks.viewer.mockResolvedValue(null);
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...member, status: "DELETED" });
    await expect(MemberPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(MemberPage({ params: Promise.resolve({ id: "member" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("conversation page", () => {
  it("marks incoming content read and renders both message directions", async () => {
    mocks.requireUser.mockResolvedValue(member);
    mocks.conversation.mockResolvedValue({
      id: "conversation", memberOneId: member.id, memberTwoId: other.id, memberOne: member, memberTwo: other,
      messages: [
        { id: "own", authorId: member.id, author: member, body: "Own message", createdAt: now },
        { id: "incoming", authorId: other.id, author: other, body: "Incoming message", createdAt: now },
      ],
    });
    render(await ConversationPage({ params: Promise.resolve({ id: "conversation" }) }));
    expect(screen.getByText("Own message")).toBeInTheDocument();
    expect(screen.getByText("Incoming message")).toBeInTheDocument();
    expect(screen.getByText("Report MESSAGE")).toBeInTheDocument();
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it("renders empty conversation when the viewer is member two", async () => {
    mocks.requireUser.mockResolvedValue(member);
    mocks.conversation.mockResolvedValue({ id: "conversation", memberOneId: other.id, memberTwoId: member.id, memberOne: other, memberTwo: member, messages: [] });
    render(await ConversationPage({ params: Promise.resolve({ id: "conversation" }) }));
    expect(screen.getByText("Say hello to Other.")).toBeInTheDocument();
  });

  it("rejects missing and inaccessible conversations", async () => {
    mocks.requireUser.mockResolvedValue(member);
    mocks.conversation.mockResolvedValueOnce(null).mockResolvedValueOnce({ memberOneId: "x", memberTwoId: "y" });
    await expect(ConversationPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(ConversationPage({ params: Promise.resolve({ id: "private" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("notification and moderation pages", () => {
  it("renders notification destinations, unread state, and mark-all action", async () => {
    mocks.requireUser.mockResolvedValue(member);
    mocks.notifications.mockResolvedValue([
      { id: "message", type: "MESSAGE", conversationId: "conversation", thread: null, replyId: null, actor: other, readAt: null, createdAt: now },
      { id: "reply", type: "REPLY", conversationId: null, thread: { slug: "topic", title: "Topic" }, replyId: "reply", actor: other, readAt: now, createdAt: now },
      { id: "system", type: "MODERATION", conversationId: null, thread: null, replyId: null, actor: null, readAt: now, createdAt: now },
    ]);
    render(await NotificationsPage());
    expect(screen.getByRole("button", { name: /Mark all read/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sent you a message/ })).toHaveAttribute("href", "/messages/conversation");
    expect(screen.getByRole("link", { name: /replied to your discussion/ })).toHaveAttribute("href", "/t/topic#reply-reply");
    expect(screen.getByRole("link", { name: /moderation update/ })).toHaveAttribute("href", "/notifications");
  });

  it("renders empty notifications without mark-all", async () => {
    mocks.requireUser.mockResolvedValue(member);
    mocks.notifications.mockResolvedValue([]);
    render(await NotificationsPage());
    expect(screen.getByText("You are all caught up")).toBeInTheDocument();
    expect(screen.queryByText(/Mark all read/)).not.toBeInTheDocument();
  });

  it("redirects the legacy moderation page into the staff console", async () => {
    mocks.requireModerator.mockResolvedValue(admin);
    await expect(ModerationPage()).rejects.toThrow("redirect:/staff/reports");
    expect(mocks.requireModerator).toHaveBeenCalledOnce();
  });
});
