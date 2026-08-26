import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ participant: vi.fn(), report: vi.fn(), verifiedRole: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { mailEntry: { findFirst: mocks.participant }, report: { findFirst: mocks.report } } }));
vi.mock("@/lib/auth", () => ({ getVerifiedUserRole: mocks.verifiedRole }));

import { canAccessPrivateAttachment } from "./attachment-access";

const member = { id: "viewer", clerkId: "clerk-viewer", role: "MEMBER" as const };
const entry = { userId: "owner", context: "MAIL_ENTRY" as const, targetId: "entry" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.participant.mockResolvedValue(null);
  mocks.report.mockResolvedValue(null);
  mocks.verifiedRole.mockResolvedValue("MEMBER");
});

describe("private attachment authorization", () => {
  it.each(["DRAFT", "MAIL_DRAFT"] as const)("allows only the owner of a %s", async (context) => {
    await expect(canAccessPrivateAttachment({ userId: "viewer", context, targetId: null }, member)).resolves.toBe(true);
    await expect(canAccessPrivateAttachment({ userId: "other", context, targetId: null }, member)).resolves.toBe(false);
  });

  it("allows active participants and denies removed or unrelated participants", async () => {
    mocks.participant.mockResolvedValueOnce({ id: "entry" });
    await expect(canAccessPrivateAttachment(entry, member)).resolves.toBe(true);
    await expect(canAccessPrivateAttachment(entry, member)).resolves.toBe(false);
    expect(mocks.participant).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ thread: { participants: { some: { userId: "viewer", removedAt: null } } } }) }));
  });

  it("allows freshly verified staff only for the exact reported Mail entry", async () => {
    const moderator = { ...member, role: "MODERATOR" as const };
    mocks.verifiedRole.mockResolvedValue("MODERATOR");
    mocks.report.mockResolvedValueOnce({ id: "report" });
    await expect(canAccessPrivateAttachment(entry, moderator)).resolves.toBe(true);
    expect(mocks.report).toHaveBeenCalledWith({ where: { targetType: "MAIL_ENTRY", targetId: "entry" }, select: { id: true } });
  });

  it("denies stale staff roles and provider verification failures", async () => {
    const admin = { ...member, role: "ADMIN" as const };
    mocks.verifiedRole.mockResolvedValueOnce("MEMBER").mockResolvedValueOnce(null);
    await expect(canAccessPrivateAttachment(entry, admin)).resolves.toBe(false);
    await expect(canAccessPrivateAttachment(entry, admin)).resolves.toBe(false);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
