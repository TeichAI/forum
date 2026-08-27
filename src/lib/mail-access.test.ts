import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { participant: fn(), staffMailbox: fn(), entry: fn(), report: fn(), verifiedRole: fn() };
});
vi.mock("@/lib/db", () => ({ db: {
  mailParticipant: { findUnique: mocks.participant },
  staffMailboxThread: { findUnique: mocks.staffMailbox },
  mailEntry: { findUnique: mocks.entry },
  report: { findFirst: mocks.report },
} }));
vi.mock("@/lib/auth", () => ({ getVerifiedUserRole: mocks.verifiedRole }));

import { canAccessMailEntry, getMailThreadAccess, isCurrentMailStaff } from "./mail-access";

const member = { id: "member", clerkId: "clerk-member", role: "MEMBER" as const };
const moderator = { id: "moderator", clerkId: "clerk-moderator", role: "MODERATOR" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.participant.mockResolvedValue(null);
  mocks.staffMailbox.mockResolvedValue(null);
  mocks.entry.mockResolvedValue(null);
  mocks.report.mockResolvedValue(null);
  mocks.verifiedRole.mockResolvedValue("MODERATOR");
});

describe("Mail access", () => {
  it("allows active personal participants without staff verification", async () => {
    mocks.participant.mockResolvedValue({ threadId: "thread", userId: member.id, removedAt: null });
    await expect(getMailThreadAccess(member, "thread")).resolves.toEqual(expect.objectContaining({ kind: "personal" }));
    expect(mocks.staffMailbox).not.toHaveBeenCalled();
    expect(mocks.verifiedRole).not.toHaveBeenCalled();
  });

  it("allows only currently verified moderators and administrators into shared threads", async () => {
    mocks.staffMailbox.mockResolvedValue({ threadId: "thread", removedAt: null });
    await expect(getMailThreadAccess(moderator, "thread")).resolves.toEqual(expect.objectContaining({ kind: "staff" }));
    await expect(getMailThreadAccess(member, "thread")).resolves.toBeNull();
    mocks.verifiedRole.mockResolvedValueOnce("MEMBER").mockResolvedValueOnce(null);
    await expect(getMailThreadAccess(moderator, "thread")).resolves.toBeNull();
    await expect(isCurrentMailStaff(moderator)).resolves.toBe(false);
  });

  it("denies removed personal and shared mailbox copies", async () => {
    mocks.participant.mockResolvedValue({ threadId: "thread", userId: member.id, removedAt: new Date() });
    mocks.staffMailbox.mockResolvedValue({ threadId: "thread", removedAt: new Date() });
    await expect(getMailThreadAccess(moderator, "thread")).resolves.toBeNull();
  });

  it("applies thread access to entries and permits verified staff reported-entry context only when requested", async () => {
    mocks.entry.mockResolvedValue({ threadId: "thread" });
    mocks.staffMailbox.mockResolvedValue({ threadId: "thread", removedAt: null });
    await expect(canAccessMailEntry(moderator, "entry")).resolves.toBe(true);

    mocks.staffMailbox.mockResolvedValue(null);
    mocks.report.mockResolvedValue({ id: "report" });
    await expect(canAccessMailEntry(moderator, "entry")).resolves.toBe(false);
    await expect(canAccessMailEntry(moderator, "entry", { allowReportedStaff: true })).resolves.toBe(true);
    mocks.verifiedRole.mockResolvedValue("MEMBER");
    await expect(canAccessMailEntry(moderator, "entry", { allowReportedStaff: true })).resolves.toBe(false);
  });
});
