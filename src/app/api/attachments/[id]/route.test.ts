import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), findAttachment: vi.fn(), access: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer }));
vi.mock("@/lib/db", () => ({ db: { attachment: { findFirst: mocks.findAttachment } } }));
vi.mock("@/lib/attachment-access", () => ({ canAccessPrivateAttachment: mocks.access }));
vi.mock("uploadthing/server", () => ({ UTApi: class { generateSignedURL = mocks.sign; } }));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "attachment" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue({ id: "viewer", clerkId: "clerk", role: "MEMBER" });
  mocks.findAttachment.mockResolvedValue({ key: "provider-key", userId: "owner", context: "MAIL_ENTRY", targetId: "entry" });
  mocks.access.mockResolvedValue(true);
  mocks.sign.mockResolvedValue({ ufsUrl: "https://signed.ufs.sh/file?signature=secret" });
});

describe("GET /api/attachments/[id]", () => {
  it("returns 401 to signed-out viewers without looking up the object", async () => {
    mocks.viewer.mockResolvedValue(null);
    const response = await GET(new Request("http://local"), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.findAttachment).not.toHaveBeenCalled();
  });

  it("returns indistinguishable 404 responses for missing and unauthorized objects", async () => {
    mocks.findAttachment.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://local"), context)).status).toBe(404);
    mocks.access.mockResolvedValueOnce(false);
    expect((await GET(new Request("http://local"), context)).status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("redirects authorized viewers to a five-minute signed URL", async () => {
    const response = await GET(new Request("http://local"), context);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.ufs.sh/file?signature=secret");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.sign).toHaveBeenCalledWith("provider-key", { expiresIn: "5 minutes" });
  });

  it("returns a private 503 without leaking signing errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sign.mockRejectedValue(new Error("token=private-provider-secret"));
    const response = await GET(new Request("http://local"), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(console.error).toHaveBeenCalledWith(expect.not.stringContaining("private-provider-secret"));
  });
});
