import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  has: vi.fn(),
  clerkClient: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  consumeUserMutation: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
  reverificationErrorResponse: (config: unknown) => Response.json({ clerk_error: { type: "forbidden", reason: "reverification-error", metadata: { reverification: config } } }, { status: 403 }),
}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeUserMutation: mocks.consumeUserMutation };
});

const user = { id: "local_1", clerkId: "user_1", username: "owen", status: "ACTIVE" };
const request = (body: unknown = { confirmation: "owen" }, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/account/delete", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_1", has: mocks.has });
  mocks.has.mockReturnValue(true);
  mocks.findUnique.mockResolvedValue(user);
  mocks.clerkClient.mockResolvedValue({ users: { getUser: mocks.getUser, deleteUser: mocks.deleteUser } });
  mocks.getUser.mockResolvedValue({ deleteSelfEnabled: true });
  mocks.deleteUser.mockResolvedValue({ id: "user_1" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.consumeUserMutation.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, remaining: 10 });
});

describe("POST /api/account/delete", () => {
  it("returns a standards-based 429 before parsing or deleting when limited", async () => {
    const { POST } = await import("./route");
    mocks.consumeUserMutation.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 45, remaining: 0 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("45");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "You’re doing that a little too quickly. Please wait a moment and try again." });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("requires authentication, an active local account, and valid JSON", async () => {
    const { POST } = await import("./route");
    mocks.auth.mockResolvedValueOnce({ userId: null, has: mocks.has });
    expect((await POST(request())).status).toBe(401);

    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);

    const invalid = new Request("http://localhost:3000/api/account/delete", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{" });
    expect((await POST(invalid)).status).toBe(400);
  });

  it("rejects missing, malformed, and cross-origin requests before authentication or deletion", async () => {
    const { POST } = await import("./route");
    for (const origin of ["", "not a URL", "https://attacker.example"]) {
      const response = await POST(request({ confirmation: "owen" }, origin));
      expect(response.status).toBe(403);
    }
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when mutation rate-limit storage is unavailable", async () => {
    const { POST } = await import("./route");
    mocks.consumeUserMutation.mockResolvedValueOnce({ outcome: "storage_unavailable", allowed: false, retryAfterSeconds: 30, remaining: 0 });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects account-deletion JSON larger than 4 KiB", async () => {
    const { POST } = await import("./route");
    const oversized = new Request("http://localhost:3000/api/account/delete", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "owen", padding: "x".repeat(4_096) }),
    });
    const response = await POST(oversized);
    expect(response.status).toBe(413);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
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
