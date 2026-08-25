import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ counts: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/mail", async (original) => ({
  ...(await original<typeof import("@/lib/mail")>()),
  getMailCounts: mocks.counts,
  listMail: mocks.list,
}));

import { Mailbox } from "./mailbox";

const now = new Date("2026-08-25T12:00:00Z");
const counts = { inbox: 2, unread: 1, starred: 1, sent: 1, drafts: 1, archive: 0, trash: 0 };

beforeEach(() => { vi.clearAllMocks(); mocks.counts.mockResolvedValue(counts); });

describe("Mailbox", () => {
  it("renders folders, searchable unread rows, selection, stars, and cursor navigation", async () => {
    mocks.list.mockResolvedValue({ kind: "threads", nextCursor: "next", items: [{
      threadId: "thread", location: "INBOX", starred: true, forcedUnread: false, lastReadAt: null,
      thread: { subject: "Water quality", lastActivityAt: now, participants: [{ userId: "user", user: { displayName: "You" } }, { userId: "other", user: { displayName: "Other" } }], entries: [{ authorId: "other", body: "Latest body", author: {} }] },
    }] });
    render(await Mailbox({ userId: "user", folder: "inbox", query: "water", cursor: "older", selectedId: "thread", children: <p>Reader</p> }));
    expect(screen.getByRole("complementary", { name: "Mail folders" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox1 unread" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("searchbox", { name: "Search mail" })).toHaveValue("water");
    expect(screen.getByRole("link", { name: "Unread: Water quality" })).toHaveAttribute("href", "/mail/thread?folder=inbox&q=water");
    expect(screen.getByLabelText("Starred")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Load more" })).toBeInTheDocument();
    expect(screen.getByText("Reader")).toBeInTheDocument();
  });

  it("renders draft and empty folder states", async () => {
    mocks.list.mockResolvedValueOnce({ kind: "drafts", nextCursor: null, items: [{ id: "draft", subject: "", body: "", updatedAt: now, recipients: [] }] });
    const view = render(await Mailbox({ userId: "user", folder: "drafts" }));
    expect(screen.getByText("(No subject)").closest("a")).toHaveAttribute("href", "/mail/compose?draft=draft");
    expect(screen.getByText("(No subject)")).toBeInTheDocument();
    view.unmount();
    mocks.list.mockResolvedValue({ kind: "threads", nextCursor: null, items: [] });
    render(await Mailbox({ userId: "user", folder: "archive", query: "missing" }));
    expect(screen.getByText("No matching mail")).toBeInTheDocument();
    expect(screen.getByText("Select a message")).toBeInTheDocument();
  });
});
