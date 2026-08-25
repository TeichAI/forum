import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ thread: vi.fn(), block: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/mail", async (original) => ({ ...(await original<typeof import("@/lib/mail")>()), getMailThread: mocks.thread }));
vi.mock("@/lib/db", () => ({ db: { block: { findFirst: mocks.block } } }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/mail/read-receipt", () => ({ MailReadReceipt: ({ unread }: { unread: boolean }) => <span>{unread ? "Read receipt" : "Already read"}</span> }));
vi.mock("@/components/markdown", () => ({ Markdown: ({ children }: { children: string }) => <p>{children}</p> }));
vi.mock("@/components/markdown-editor", () => ({ MarkdownEditor: ({ placeholder }: { placeholder: string }) => <textarea placeholder={placeholder} /> }));
vi.mock("@/components/forum/report-form", () => ({ ReportForm: ({ targetType }: { targetType: string }) => <button>{`Report ${targetType}`}</button> }));
vi.mock("@/components/ui/rate-limit-form", () => ({ RateLimitForm: ({ children }: { children: React.ReactNode }) => <form>{children}</form> }));
vi.mock("@/components/ui/submit-button", () => ({ SubmitButton: ({ children, className }: { children: React.ReactNode; className?: string }) => <button className={className}>{children}</button> }));

import { MailReader } from "./mail-reader";

const now = new Date("2026-08-25T12:00:00Z");
const user = { id: "user", username: "you", displayName: "You", imageUrl: null, role: "MEMBER", status: "ACTIVE" };
const other = { id: "other", username: "other", displayName: "Other", imageUrl: null, role: "MEMBER", status: "ACTIVE" };
const participant = { location: "INBOX", starred: false, forcedUnread: false, lastReadAt: null, thread: { subject: "Subject", lastActivityAt: now, participants: [{ userId: "user", user }, { userId: "other", user: other }], entries: [{ id: "entry", authorId: "other", author: other, body: "Private body", createdAt: now }] } };

beforeEach(() => { vi.clearAllMocks(); mocks.thread.mockResolvedValue(participant); mocks.block.mockResolvedValue(null); mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); }); });

describe("MailReader", () => {
  it("renders thread content, accessible controls, report, and reply", async () => {
    render(await MailReader({ userId: "user", threadId: "thread", folder: "inbox" }));
    expect(screen.getByRole("heading", { name: "Subject" })).toBeInTheDocument();
    expect(screen.getByText("Private body")).toBeInTheDocument();
    expect(screen.getByText("Read receipt")).toBeInTheDocument();
    expect(screen.getByText("Report MAIL_ENTRY")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Star mail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive mail" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reply to Other…")).toBeInTheDocument();
  });

  it("shows restore/delete controls in trash and disables replies for blocked members", async () => {
    mocks.thread.mockResolvedValue({ ...participant, location: "TRASH", starred: true });
    mocks.block.mockResolvedValue({ blockerId: "other" });
    render(await MailReader({ userId: "user", threadId: "thread", folder: "trash" }));
    expect(screen.getByRole("button", { name: "Unstar mail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore from trash" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeInTheDocument();
    expect(screen.getByText(/replies are unavailable/)).toBeInTheDocument();
  });

  it("rejects inaccessible threads", async () => {
    mocks.thread.mockResolvedValue(null);
    await expect(MailReader({ userId: "user", threadId: "missing", folder: "inbox" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
