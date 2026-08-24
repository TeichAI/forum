import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, currentUserMock, findUniqueMock, upsertMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
  findUniqueMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
    },
  },
}));

import { syncCurrentUser } from "./auth";

describe("syncCurrentUser", () => {
  beforeEach(() => {
    authMock.mockReset();
    currentUserMock.mockReset();
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it("returns the existing local user without fetching the Clerk profile", async () => {
    const existing = { id: "local_user", clerkId: "user_test" };
    authMock.mockResolvedValue({ userId: "user_test" });
    findUniqueMock.mockResolvedValue(existing);

    await expect(syncCurrentUser()).resolves.toBe(existing);
    expect(currentUserMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("provisions a missing user idempotently without a webhook", async () => {
    const created = { id: "local_user", clerkId: "user_test", username: "owen_teich" };
    authMock.mockResolvedValue({ userId: "user_test" });
    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    currentUserMock.mockResolvedValue({
      username: "Owen Teich",
      firstName: "Owen",
      lastName: "Teich",
      imageUrl: "https://example.com/avatar.png",
      primaryEmailAddressId: "email_primary",
      emailAddresses: [{ id: "email_primary", emailAddress: "owen@example.com" }],
    });
    upsertMock.mockResolvedValue(created);

    await expect(syncCurrentUser()).resolves.toBe(created);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { clerkId: "user_test" },
      update: {},
      create: {
        clerkId: "user_test",
        username: "owen_teich",
        displayName: "Owen Teich",
        email: "owen@example.com",
        imageUrl: "https://example.com/avatar.png",
        role: "MEMBER",
      },
    });
  });
});
