import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), draft: vi.fn(), member: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/mail", () => ({ normalizeMailFolder: (value: string) => value === "sent" ? "sent" : "inbox", getMailDraft: mocks.draft }));
vi.mock("@/lib/db", () => ({ db: { user: { findFirst: mocks.member } } }));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: () => true }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/mail/mailbox", () => ({ Mailbox: ({ userId, folder, query, selectedId, children }: { userId: string; folder: string; query: string; selectedId?: string; children?: React.ReactNode }) => <section>{`${userId}:${folder}:${query}:${selectedId ?? "none"}`}{children}</section> }));
vi.mock("@/components/mail/mail-reader", () => ({ MailReader: ({ threadId }: { threadId: string }) => <p>{`Reader ${threadId}`}</p> }));
vi.mock("@/components/mail/mail-composer", () => ({ MailComposer: ({ initialRecipients, draft }: { initialRecipients: Array<{ displayName: string }>; draft?: { subject: string } }) => <p>{draft ? `Draft ${draft.subject}` : `To ${initialRecipients[0]?.displayName ?? "nobody"}`}</p> }));

import MailPage from "./page";
import MailThreadPage from "./[threadId]/page";
import ComposeMailPage from "./compose/page";

const user = { id: "user", role: "MEMBER" };
const member = { id: "other", displayName: "Other", username: "other", imageUrl: null, role: "MEMBER" };

beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue(user); mocks.draft.mockResolvedValue(null); mocks.member.mockResolvedValue(member); mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); }); });

describe("Mail pages", () => {
  it("renders filtered list and selected reader routes", async () => {
    const list = render(await MailPage({ searchParams: Promise.resolve({ folder: "sent", q: "pond", cursor: "older" }) }));
    expect(screen.getByText("user:sent:pond:none")).toBeInTheDocument();
    list.unmount();
    render(await MailThreadPage({ params: Promise.resolve({ threadId: "thread" }), searchParams: Promise.resolve({ folder: "sent", q: "pond" }) }));
    expect(screen.getByText("user:sent:pond:thread")).toBeInTheDocument();
    expect(screen.getByText("Reader thread")).toBeInTheDocument();
  });

  it("prefills compose from a profile and loads owned drafts", async () => {
    const first = render(await ComposeMailPage({ searchParams: Promise.resolve({ to: "other" }) }));
    expect(screen.getByText("To Other")).toBeInTheDocument();
    first.unmount();
    mocks.draft.mockResolvedValue({ id: "draft", threadId: null, subject: "Saved", body: "Body", recipients: [{ recipient: member }] });
    render(await ComposeMailPage({ searchParams: Promise.resolve({ draft: "draft" }) }));
    expect(screen.getByText("Draft Saved")).toBeInTheDocument();
  });

  it("rejects inaccessible draft ids", async () => {
    await expect(ComposeMailPage({ searchParams: Promise.resolve({ draft: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
