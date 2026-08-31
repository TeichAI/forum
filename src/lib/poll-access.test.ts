import { beforeEach, describe, expect, it, vi } from "vitest";

const verified = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getVerifiedUserRole: verified }));

import { canAccessPollThread, isPublicPollThread } from "./poll-access";

const publicThread = { status: "PUBLISHED", author: { status: "ACTIVE" }, category: { archivedAt: null } };

beforeEach(() => vi.clearAllMocks());

describe("poll visibility", () => {
  it("allows public threads without staff verification", async () => {
    expect(isPublicPollThread(publicThread)).toBe(true);
    await expect(canAccessPollThread(publicThread, null)).resolves.toBe(true);
    expect(verified).not.toHaveBeenCalled();
  });

  it("requires a live staff role for every non-public thread", async () => {
    const hidden = { ...publicThread, status: "HIDDEN" };
    await expect(canAccessPollThread(hidden, { clerkId: "member", role: "MEMBER" })).resolves.toBe(false);
    verified.mockResolvedValueOnce("MEMBER");
    await expect(canAccessPollThread(hidden, { clerkId: "downgraded", role: "ADMIN" })).resolves.toBe(false);
    verified.mockResolvedValueOnce("MODERATOR");
    await expect(canAccessPollThread(hidden, { clerkId: "staff", role: "MODERATOR" })).resolves.toBe(true);
    expect(verified).toHaveBeenCalledTimes(2);
  });
});
