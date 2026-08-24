import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, currentUserMock, findUniqueMock, upsertMock, redirectMock, e2eUserMock, e2eModeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
  findUniqueMock: vi.fn(),
  upsertMock: vi.fn(),
  redirectMock: vi.fn(),
  e2eUserMock: vi.fn(),
  e2eModeMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/e2e-auth", () => ({ getE2ETestUserId: e2eUserMock, isE2ETestMode: e2eModeMock }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
    },
  },
}));

import { getViewer, requireAdmin, requireModerator, requireUser, syncCurrentUser } from "./auth";

describe("syncCurrentUser", () => {
  beforeEach(() => {
    authMock.mockReset();
    currentUserMock.mockReset();
    findUniqueMock.mockReset();
    upsertMock.mockReset();
    redirectMock.mockReset().mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    e2eUserMock.mockReset().mockResolvedValue(null);
    e2eModeMock.mockReset().mockReturnValue(false);
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

  it("loads a local E2E identity without consulting Clerk", async () => {
    e2eModeMock.mockReturnValue(true);
    e2eUserMock.mockResolvedValue("local_user");
    findUniqueMock.mockResolvedValue({ id: "local_user" });
    await expect(syncCurrentUser()).resolves.toEqual({ id: "local_user" });
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: "local_user" } });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("treats a missing E2E cookie as anonymous without consulting Clerk", async () => {
    e2eModeMock.mockReturnValue(true);
    await expect(syncCurrentUser()).resolves.toBeNull();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("returns null for signed-out and missing Clerk profiles", async () => {
    authMock.mockResolvedValueOnce({ userId: null }).mockResolvedValueOnce({ userId: "missing" });
    await expect(syncCurrentUser()).resolves.toBeNull();
    findUniqueMock.mockResolvedValue(null);
    currentUserMock.mockResolvedValue(null);
    await expect(syncCurrentUser()).resolves.toBeNull();
  });

  it("falls back to a safe username, image, and configured admin role", async () => {
    vi.stubEnv("ADMIN_CLERK_USER_IDS", " other, admin-id ");
    authMock.mockResolvedValue({ userId: "admin-id" });
    findUniqueMock.mockResolvedValue(null);
    currentUserMock.mockResolvedValue({ username: null, firstName: null, lastName: null, imageUrl: null, primaryEmailAddressId: null, emailAddresses: [] });
    upsertMock.mockResolvedValue({ id: "created" });
    await syncCurrentUser();
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ username: "member", displayName: "member", email: undefined, role: "ADMIN" }) }));
    vi.unstubAllEnvs();
  });

  it("resolves username collisions before provisioning", async () => {
    authMock.mockResolvedValue({ userId: "new-id" });
    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ clerkId: "someone-else" })
      .mockResolvedValueOnce(null);
    currentUserMock.mockResolvedValue({ username: "Taken", firstName: "New", lastName: "User", imageUrl: null, primaryEmailAddressId: null, emailAddresses: [] });
    upsertMock.mockResolvedValue({ id: "created" });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await syncCurrentUser();
    expect(upsertMock.mock.calls[0][0].create.username).toMatch(/^taken_/);
    vi.restoreAllMocks();
  });

  it("recovers when concurrent requests provision the same Clerk user", async () => {
    const raced = { id: "winner", clerkId: "race-id", username: "racer" };
    authMock.mockResolvedValue({ userId: "race-id" });
    findUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
    currentUserMock.mockResolvedValue({ username: "Racer", firstName: "Race", lastName: "Winner", imageUrl: null, primaryEmailAddressId: null, emailAddresses: [] });
    upsertMock.mockRejectedValue({ code: "P2002" });
    await expect(syncCurrentUser()).resolves.toBe(raced);
    expect(findUniqueMock).toHaveBeenLastCalledWith({ where: { clerkId: "race-id" } });
  });

  it("does not swallow unrelated persistence failures", async () => {
    authMock.mockResolvedValue({ userId: "broken-id" });
    findUniqueMock.mockResolvedValue(null);
    currentUserMock.mockResolvedValue({ username: "Broken", firstName: null, lastName: null, imageUrl: null, primaryEmailAddressId: null, emailAddresses: [] });
    upsertMock.mockRejectedValue(new Error("database unavailable"));
    await expect(syncCurrentUser()).rejects.toThrow("database unavailable");
  });
});

describe("viewer authorization", () => {
  beforeEach(() => {
    e2eUserMock.mockReset().mockResolvedValue(null);
    e2eModeMock.mockReset().mockReturnValue(false);
    authMock.mockReset();
    findUniqueMock.mockReset();
    redirectMock.mockReset().mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  });

  it("returns the synchronized viewer", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(getViewer()).resolves.toBeNull();
  });

  it("redirects signed-out, deleted, and actively suspended users", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    await expect(requireUser()).rejects.toThrow("redirect:/sign-in");
    e2eModeMock.mockReturnValue(true);
    for (const user of [
      { status: "DELETED", suspendedUntil: null },
      { status: "ACTIVE", suspendedUntil: new Date(Date.now() + 60_000) },
    ]) {
      e2eUserMock.mockResolvedValueOnce("local");
      findUniqueMock.mockResolvedValueOnce(user);
      await expect(requireUser()).rejects.toThrow("redirect:/suspended");
    }
  });

  it("allows active and expired-suspension users", async () => {
    e2eModeMock.mockReturnValue(true);
    e2eUserMock.mockResolvedValue("local");
    findUniqueMock.mockResolvedValue({ id: "local", status: "ACTIVE", suspendedUntil: new Date(Date.now() - 1), role: "MEMBER" });
    await expect(requireUser()).resolves.toEqual(expect.objectContaining({ id: "local" }));
  });

  it.each(["MODERATOR", "ADMIN"])("allows %s staff", async (role) => {
    e2eModeMock.mockReturnValue(true);
    e2eUserMock.mockResolvedValue("local");
    findUniqueMock.mockResolvedValue({ id: "local", status: "ACTIVE", suspendedUntil: null, role });
    await expect(requireModerator()).resolves.toEqual(expect.objectContaining({ role }));
  });

  it("redirects ordinary members from staff operations", async () => {
    e2eModeMock.mockReturnValue(true);
    e2eUserMock.mockResolvedValue("local");
    findUniqueMock.mockResolvedValue({ id: "local", status: "ACTIVE", suspendedUntil: null, role: "MEMBER" });
    await expect(requireModerator()).rejects.toThrow("redirect:/");
  });

  it("allows only administrators into admin operations", async () => {
    e2eModeMock.mockReturnValue(true);
    e2eUserMock.mockResolvedValue("local");
    findUniqueMock
      .mockResolvedValueOnce({ id: "local", status: "ACTIVE", suspendedUntil: null, role: "ADMIN" })
      .mockResolvedValueOnce({ id: "local", status: "ACTIVE", suspendedUntil: null, role: "MODERATOR" });

    await expect(requireAdmin()).resolves.toEqual(expect.objectContaining({ role: "ADMIN" }));
    await expect(requireAdmin()).rejects.toThrow("redirect:/");
  });
});
