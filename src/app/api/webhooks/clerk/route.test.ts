import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock, updateManyMock, findUniqueMock, upsertMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  updateManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      updateMany: updateManyMock,
      findUnique: findUniqueMock,
      upsert: upsertMock,
    },
  },
}));

describe("Clerk webhook route", () => {
  beforeEach(() => {
    headersMock.mockReset();
    updateManyMock.mockReset();
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it("rejects requests with incomplete signature headers", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_dGVzdC1zZWNyZXQ=");
    headersMock.mockResolvedValue(new Headers({ "svix-id": "only-one" }));
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/webhooks/clerk", { method: "POST" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing signature" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when no signing secret is configured", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "");
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/webhooks/clerk", { method: "POST" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Webhook endpoint is disabled" });
    expect(headersMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature when enabled", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_dGVzdC1zZWNyZXQ=");
    headersMock.mockResolvedValue(new Headers({
      "svix-id": "msg_invalid",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,invalid",
    }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: JSON.stringify({ type: "user.deleted", data: { id: "user_test" } }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("rejects webhook bodies larger than 1 MiB", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_dGVzdC1zZWNyZXQ=");
    headersMock.mockResolvedValue(new Headers({
      "svix-id": "msg_large",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,invalid",
    }));
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      headers: { "content-length": String(1024 * 1024 + 1) },
      body: "{}",
    }));
    expect(response.status).toBe(413);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("processes a valid signed event when enabled", async () => {
    const secret = "whsec_dGVzdC1zZWNyZXQ=";
    const messageId = "msg_valid";
    const timestamp = new Date();
    const payload = JSON.stringify({ type: "user.deleted", data: { id: "user_test" } });
    const signature = new Webhook(secret).sign(messageId, timestamp, payload);
    vi.stubEnv("CLERK_WEBHOOK_SECRET", secret);
    headersMock.mockResolvedValue(new Headers({
      "svix-id": messageId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    }));
    updateManyMock.mockResolvedValue({ count: 1 });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: payload,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { clerkId: "user_test" },
      data: { status: "DELETED", deletedAt: expect.any(Date), email: null },
    });
  });

  it.each([
    ["user.created", null, "duplicate_usernew", "admin", "ADMIN"],
    ["user.updated", { clerkId: "user_new", username: "kept_name", displayName: "Kept Name" }, "kept_name", "moderator", "MODERATOR"],
    ["user.updated", { clerkId: "user_new", username: "kept_name", displayName: "Kept Name" }, "kept_name", "owner", "MEMBER"],
  ])("processes a signed %s profile event", async (type, current, expectedUsername, publicRole, expectedRole) => {
    const secret = "whsec_dGVzdC1zZWNyZXQ=";
    const messageId = `msg_${type}`;
    const timestamp = new Date();
    const payload = JSON.stringify({
      type,
      data: {
        id: "user_new", username: "Duplicate", first_name: "New", last_name: "Member",
        image_url: "https://example.com/avatar.png", primary_email_address_id: "email_1",
        email_addresses: [{ id: "email_1", email_address: "new@example.com" }],
        public_metadata: { role: publicRole },
      },
    });
    vi.stubEnv("CLERK_WEBHOOK_SECRET", secret);
    headersMock.mockResolvedValue(new Headers({
      "svix-id": messageId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": new Webhook(secret).sign(messageId, timestamp, payload),
    }));
    findUniqueMock.mockResolvedValueOnce(current).mockResolvedValueOnce(current ? current : { clerkId: "other" });
    upsertMock.mockResolvedValue({});
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/webhooks/clerk", { method: "POST", body: payload }));
    expect(response.status).toBe(200);
    const args = upsertMock.mock.calls[0][0];
    expect(args.create.username).toBe(expectedUsername);
    expect(args.create.role).toBe(expectedRole);
    expect(args.update).toEqual({ email: "new@example.com", imageUrl: "https://example.com/avatar.png", role: expectedRole });
    expect(args.create.displayName).toBe(current ? "Kept Name" : "New Member");
  });

  it("ignores poisoned unsafe_metadata while synchronizing a signed user event", async () => {
    const secret = "whsec_dGVzdC1zZWNyZXQ=";
    const messageId = "msg_unsafe_metadata";
    const timestamp = new Date();
    const payload = JSON.stringify({
      type: "user.updated",
      data: {
        id: "user_member",
        username: "member",
        first_name: "Forum",
        last_name: "Member",
        image_url: null,
        primary_email_address_id: null,
        email_addresses: [],
        public_metadata: { role: "member" },
        unsafe_metadata: { role: "admin", claimedRole: "ADMIN", isModerator: true },
      },
    });
    vi.stubEnv("CLERK_WEBHOOK_SECRET", secret);
    headersMock.mockResolvedValue(new Headers({
      "svix-id": messageId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": new Webhook(secret).sign(messageId, timestamp, payload),
    }));
    findUniqueMock.mockResolvedValue({ clerkId: "user_member", username: "member", displayName: "Forum Member" });
    upsertMock.mockResolvedValue({});
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/webhooks/clerk", { method: "POST", body: payload }));

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ role: "MEMBER" }),
      create: expect.objectContaining({ role: "MEMBER" }),
    }));
  });
});
