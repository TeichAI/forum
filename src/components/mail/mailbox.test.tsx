import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ counts: vi.fn(), staffCounts: vi.fn(), list: vi.fn(), staffList: vi.fn() }));
vi.mock("@/lib/mail", async (original) => ({
  ...(await original<typeof import("@/lib/mail")>()),
  getMailCounts: mocks.counts,
  getStaffMailCounts: mocks.staffCounts,
  listMail: mocks.list,
  listStaffMail: mocks.staffList,
}));

import { Mailbox } from "./mailbox";

const now = new Date("2026-08-25T12:00:00Z");
const counts = { inbox: 2, unread: 1, starred: 1, sent: 1, drafts: 1, archive: 0, trash: 0 };
const viewer = { id: "user", clerkId: "clerk-user", role: "MEMBER" as const };

beforeEach(() => { vi.clearAllMocks(); mocks.counts.mockResolvedValue(counts); mocks.staffCounts.mockResolvedValue({ inbox: 0, unread: 0, starred: 0, archive: 0, trash: 0 }); });

describe("Mailbox", () => {
  it("renders folders, searchable unread rows, selection, stars, and cursor navigation", async () => {
    mocks.list.mockResolvedValue({ kind: "threads", nextCursor: "next", items: [{
      accessContext: "personal", threadId: "thread", location: "INBOX", starred: true, forcedUnread: false, lastReadAt: null,
      thread: { subject: "Water quality", lastActivityAt: now, staffMailbox: null, participants: [{ userId: "user", user: { displayName: "You" } }, { userId: "other", user: { displayName: "Other" } }], entries: [{ authorId: "other", body: "Latest body", author: { displayName: "Other" } }] },
    }] });
    render(await Mailbox({ viewer, folder: "inbox", staffAccess: false, query: "water", cursor: "older", selectedId: "thread", children: <p>Reader</p> }));
    expect(screen.getByRole("complementary", { name: "Mail folders" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox1 unread" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("searchbox", { name: "Search mail" })).toHaveValue("water");
    expect(screen.getByRole("link", { name: "Unread: Water quality" })).toHaveAttribute("href", "/mail/thread?folder=inbox&q=water");
    expect(screen.getByLabelText("Starred")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Load more" })).toBeInTheDocument();
    expect(screen.getByText("Reader")).toBeInTheDocument();
  });

  it("renders draft and empty folder states", async () => {
    mocks.list.mockResolvedValueOnce({ kind: "drafts", nextCursor: null, items: [{ id: "draft", subject: "", body: "", staffMailbox: false, updatedAt: now, recipients: [] }] });
    const view = render(await Mailbox({ viewer, folder: "drafts", staffAccess: false }));
    expect(screen.getByText("(No subject)").closest("a")).toHaveAttribute("href", "/mail/compose?draft=draft");
    expect(screen.getByText("(No subject)")).toBeInTheDocument();
    view.unmount();
    mocks.list.mockResolvedValue({ kind: "threads", nextCursor: null, items: [] });
    render(await Mailbox({ viewer, folder: "archive", staffAccess: false, query: "missing" }));
    expect(screen.getByText("No matching mail")).toBeInTheDocument();
    expect(screen.getByText("Select a message")).toBeInTheDocument();
  });

  it("renders the staff unread badge, shared subfolders, and originating member rows", async () => {
    const staffViewer = { id: "moderator", clerkId: "clerk-moderator", role: "MODERATOR" as const };
    mocks.staffCounts.mockResolvedValue({ inbox: 2, unread: 2, starred: 1, archive: 0, trash: 0 });
    mocks.staffList.mockResolvedValue({ kind: "threads", nextCursor: null, items: [{
      accessContext: "staff", threadId: "shared", location: "INBOX", starred: false, forcedUnread: false, lastReadAt: null,
      thread: { subject: "Need help", lastActivityAt: now, staffMailbox: {}, participants: [{ userId: "member", user: { displayName: "Pond Member" } }], entries: [{ authorId: "member", body: "Question", author: { displayName: "Pond Member" } }] },
    }] });
    render(await Mailbox({ viewer: staffViewer, folder: "staff", staffFolder: "inbox", staffAccess: true }));
    expect(screen.getByRole("link", { name: "Staff Inbox2 unread staff mail" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Staff Inbox folders" })).toBeInTheDocument();
    expect(screen.getByText("Pond Member")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Unread: Need help" })).toHaveAttribute("href", "/mail/shared?folder=staff&staffFolder=inbox");
  });
});
