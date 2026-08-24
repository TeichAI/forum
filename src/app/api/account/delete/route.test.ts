import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  has: vi.fn(),
  clerkClient: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
  reverificationErrorResponse: (config: unknown) => Response.json({ clerk_error: { type: "forbidden", reason: "reverification-error", metadata: { reverification: config } } }, { status: 403 }),
}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));

const user = { id: "local_1", clerkId: "user_1", username: "owen", status: "ACTIVE" };
const request = (body: unknown = { confirmation: "owen" }) => new Request("http://localhost/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_1", has: mocks.has });
  mocks.has.mockReturnValue(true);
  mocks.findUnique.mockResolvedValue(user);
  mocks.clerkClient.mockResolvedValue({ users: { getUser: mocks.getUser, deleteUser: mocks.deleteUser } });
  mocks.getUser.mockResolvedValue({ deleteSelfEnabled: true });
  mocks.deleteUser.mockResolvedValue({ id: "user_1" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/account/delete", () => {
  it("requires authentication, an active local account, and valid JSON", async () => {
    const { POST } = await import("./route");
    mocks.auth.mockResolvedValueOnce({ userId: null, has: mocks.has });
    expect((await POST(request())).status).toBe(401);

    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);

    const invalid = new Request("http://localhost/api/account/delete", { method: "POST", body: "{" });
    expect((await POST(invalid)).status).toBe(400);
  });

  it("checks the exact username before requesting reverification", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ confirmation: "OWEN" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Type owen exactly to confirm." });
    expect(mocks.has).not.toHaveBeenCalled();
  });

  it("returns Clerk's reverification hint for an old session", async () => {
    const { POST } = await import("./route");
    mocks.has.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ clerk_error: expect.objectContaining({ reason: "reverification-error" }) }));
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes Clerk first and then soft-deletes the local account", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.has).toHaveBeenCalledWith({ reverification: { level: "multi_factor", afterMinutes: 10 } });
    expect(mocks.deleteUser).toHaveBeenCalledWith("user_1");
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "local_1" }, data: { status: "DELETED", deletedAt: expect.any(Date), email: null } });
  });

  it("honors disabled self-deletion and reports provider failures", async () => {
    const { POST } = await import("./route");
    mocks.getUser.mockResolvedValueOnce({ deleteSelfEnabled: false });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.deleteUser).not.toHaveBeenCalled();

    mocks.deleteUser.mockRejectedValueOnce(new Error("Clerk unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
