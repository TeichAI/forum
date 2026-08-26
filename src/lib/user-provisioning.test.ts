import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: mocks } }));

import { allocateUsername, provisionClerkUser } from "./user-provisioning";

beforeEach(() => vi.clearAllMocks());

describe("Clerk user provisioning", () => {
  it("uses a nonempty safe base and deterministic collision suffix", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(allocateUsername("🔥", "user_abc123", undefined, 0)).resolves.toBe("member");
    await expect(allocateUsername("Taken Name", "user_abc123", undefined, 1)).resolves.toBe("taken_name_erabc123");
  });

  it("updates an existing account without changing its username", async () => {
    mocks.findUnique.mockResolvedValue({ id: "local", clerkId: "user_1", username: "kept" });
    mocks.upsert.mockResolvedValue({ id: "local", username: "kept" });
    await provisionClerkUser({ clerkId: "user_1", preferredUsername: "new", displayName: "New", role: "ADMIN" });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { clerkId: "user_1" },
      update: { email: undefined, imageUrl: undefined, role: "ADMIN" },
      create: { clerkId: "user_1", username: "kept", displayName: undefined, email: undefined, imageUrl: undefined, role: "ADMIN" },
    });
  });

  it("recovers idempotently when another request creates the Clerk account", async () => {
    const raced = { id: "winner", clerkId: "user_1", username: "winner" };
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raced);
    mocks.upsert.mockRejectedValue({ code: "P2002" });
    await expect(provisionClerkUser({ clerkId: "user_1", preferredUsername: "Winner", displayName: "Winner", role: "MEMBER" })).resolves.toEqual(raced);
  });
});
