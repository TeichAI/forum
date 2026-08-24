import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncAccountIdentity, updateAccountProfile, type AccountActionState } from "./account";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  auth: vi.fn(),
  clerkClient: vi.fn(),
  update: vi.fn(),
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ db: { user: { update: mocks.update } } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: mocks.clerkClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const localUser = { id: "local_1", clerkId: "user_1", username: "owen" };
const initialAccountActionState: AccountActionState = { status: "idle" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(localUser);
  mocks.auth.mockResolvedValue({ userId: "user_1" });
  mocks.clerkClient.mockResolvedValue({ users: { getUser: mocks.getUser } });
  mocks.update.mockResolvedValue(localUser);
  mocks.getUser.mockResolvedValue({
    primaryEmailAddressId: "email_1",
    emailAddresses: [{ id: "email_1", emailAddress: "owen@example.com" }],
    imageUrl: "https://example.com/avatar.png",
  });
});

describe("account profile actions", () => {
  it("normalizes, updates, and revalidates an account profile", async () => {
    const result = await updateAccountProfile(initialAccountActionState, form({ displayName: " Owen Teich ", username: " NEW_NAME ", bio: " Pond builder " }));

    expect(result).toEqual({ status: "success", message: "Profile saved." });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "local_1" }, data: { displayName: "Owen Teich", username: "new_name", bio: "Pond builder" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/members/local_1");
  });

  it("returns field errors without writing invalid profile data", async () => {
    const result = await updateAccountProfile(initialAccountActionState, form({ displayName: "", username: "Bad Name", bio: "x".repeat(501) }));

    expect(result.status).toBe("error");
    expect(result.fieldErrors).toEqual(expect.objectContaining({ displayName: expect.any(String), username: expect.any(String), bio: expect.any(String) }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns a specific collision error and a generic persistence error", async () => {
    mocks.update.mockRejectedValueOnce({ code: "P2002" });
    await expect(updateAccountProfile(initialAccountActionState, form({ displayName: "Owen", username: "taken", bio: "" }))).resolves.toEqual(expect.objectContaining({ fieldErrors: { username: "Choose another username." } }));

    mocks.update.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(updateAccountProfile(initialAccountActionState, form({ displayName: "Owen", username: "available", bio: "" }))).resolves.toEqual({ status: "error", message: "We couldn’t save your profile. Please try again." });
  });
});

describe("account identity synchronization", () => {
  it("loads authoritative Clerk identity fields and updates the local user", async () => {
    const result = await syncAccountIdentity();

    expect(result).toEqual({ ok: true, email: "owen@example.com", imageUrl: "https://example.com/avatar.png" });
    expect(mocks.getUser).toHaveBeenCalledWith("user_1");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "local_1" }, data: { email: "owen@example.com", imageUrl: "https://example.com/avatar.png" } });
  });

  it("rejects a mismatched session and reports synchronization failures", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: "someone_else" });
    await expect(syncAccountIdentity()).resolves.toEqual({ ok: false, message: "Your account session is no longer available." });
    expect(mocks.getUser).not.toHaveBeenCalled();

    mocks.getUser.mockRejectedValueOnce(new Error("Clerk unavailable"));
    await expect(syncAccountIdentity()).resolves.toEqual({ ok: false, message: "The account changed, but the forum profile could not be refreshed. Please try again." });
  });
});
