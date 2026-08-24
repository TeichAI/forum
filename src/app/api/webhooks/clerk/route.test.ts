import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock, updateManyMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  updateManyMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      updateMany: updateManyMock,
    },
  },
}));

describe("Clerk webhook route", () => {
  beforeEach(() => {
    headersMock.mockReset();
    updateManyMock.mockReset();
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
});
