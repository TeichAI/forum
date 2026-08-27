import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ canAccessMailEntry: vi.fn() }));
vi.mock("@/lib/mail-access", () => ({ canAccessMailEntry: mocks.canAccessMailEntry }));

import { canAccessPrivateAttachment } from "./attachment-access";

const member = { id: "viewer", clerkId: "clerk-viewer", role: "MEMBER" as const };
const entry = { userId: "owner", context: "MAIL_ENTRY" as const, targetId: "entry" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canAccessMailEntry.mockResolvedValue(false);
});

describe("private attachment authorization", () => {
  it.each(["DRAFT", "MAIL_DRAFT"] as const)("allows only the owner of a %s", async (context) => {
    await expect(canAccessPrivateAttachment({ userId: "viewer", context, targetId: null }, member)).resolves.toBe(true);
    await expect(canAccessPrivateAttachment({ userId: "other", context, targetId: null }, member)).resolves.toBe(false);
  });

  it("uses the shared Mail authorization rule for entry attachments", async () => {
    mocks.canAccessMailEntry.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(canAccessPrivateAttachment(entry, member)).resolves.toBe(true);
    await expect(canAccessPrivateAttachment(entry, member)).resolves.toBe(false);
    expect(mocks.canAccessMailEntry).toHaveBeenCalledWith(member, "entry", { allowReportedStaff: true });
  });

  it("rejects non-Mail private contexts and missing targets", async () => {
    await expect(canAccessPrivateAttachment({ ...entry, context: "THREAD" }, member)).resolves.toBe(false);
    await expect(canAccessPrivateAttachment({ ...entry, targetId: null }, member)).resolves.toBe(false);
    expect(mocks.canAccessMailEntry).not.toHaveBeenCalled();
  });
});
