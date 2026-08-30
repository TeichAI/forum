import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), consume: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer, requireUser: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  consumeUserMutation: mocks.consume,
}));

describe("UploadThing route capability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails upload mutations closed with a standards-based 503", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "configured-for-mutation");
    mocks.viewer.mockResolvedValue({ id: "local", clerkId: "clerk", role: "MEMBER" });
    mocks.consume.mockResolvedValue({ outcome: "storage_unavailable", allowed: false, retryAfterSeconds: 30, remaining: 0 });
    const { POST } = await import("./route");
    const { NextRequest } = await import("next/server");
    const response = await POST(new NextRequest("http://localhost/api/uploadthing", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps precise retry timing in the 429 header and out of the JSON body", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "configured-for-limited-upload");
    mocks.viewer.mockResolvedValue({ id: "local", clerkId: "clerk", role: "MEMBER" });
    mocks.consume.mockResolvedValue({ outcome: "limit_exceeded", allowed: false, retryAfterSeconds: 47, remaining: 0 });
    const { POST } = await import("./route");
    const { NextRequest } = await import("next/server");
    const response = await POST(new NextRequest("http://localhost/api/uploadthing", { method: "POST" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("47");
    await expect(response.json()).resolves.toEqual({ error: "You’re doing that a little too quickly. Please wait a moment and try again." });
  });

  it("passes signed-provider hook requests to UploadThing instead of requiring a browser session", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "configured-for-callback");
    mocks.viewer.mockClear();
    const { POST } = await import("./route");
    const { NextRequest } = await import("next/server");
    const response = await POST(new NextRequest("http://localhost/api/uploadthing?slug=mailImageUploader", {
      method: "POST",
      headers: { "uploadthing-hook": "callback", "x-uploadthing-signature": "invalid" },
      body: "{}",
    }));
    expect(response.status).not.toBe(401);
    expect(mocks.viewer).not.toHaveBeenCalled();
  });

  it("rejects GET and POST requests without initializing UploadThing", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "");
    const { GET, POST } = await import("./route");

    const getResponse = await GET({} as never);
    const postResponse = await POST({} as never);

    expect(getResponse.status).toBe(503);
    expect(postResponse.status).toBe(503);
    await expect(getResponse.json()).resolves.toEqual({ error: "Image uploads are not enabled." });
    await expect(postResponse.json()).resolves.toEqual({ error: "Image uploads are not enabled." });
  });

  it("exposes the configured file router when a token is present", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "configured-for-route-discovery");
    const [{ GET }, { NextRequest }] = await Promise.all([import("./route"), import("next/server")]);

    const response = await GET(new NextRequest("http://localhost/api/uploadthing"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "imageUploader" }),
      expect.objectContaining({ slug: "mailImageUploader" }),
    ]));
  });
});
