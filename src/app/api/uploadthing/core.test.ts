import { beforeEach, describe, expect, it, vi } from "vitest";

type RegisteredRoute = {
  config: unknown;
  middleware?: () => Promise<unknown>;
  complete?: (input: unknown) => Promise<unknown>;
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAttachment: vi.fn(),
  routes: [] as RegisteredRoute[],
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ db: { attachment: { create: mocks.createAttachment } } }));
vi.mock("uploadthing/next", () => ({
  createUploadthing: () => (config: unknown) => {
    const route: RegisteredRoute = { config };
    mocks.routes.push(route);
    const builder = {
      middleware(callback: () => Promise<unknown>) { route.middleware = callback; return builder; },
      onUploadComplete(callback: (input: unknown) => Promise<unknown>) { route.complete = callback; return builder; },
    };
    return builder;
  },
}));

describe("UploadThing router contract", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.routes.length = 0;
    mocks.requireUser.mockReset();
    mocks.createAttachment.mockReset();
    await import("./core");
  });

  it("sets explicit public and private ACLs", () => {
    expect(mocks.routes).toHaveLength(2);
    expect(mocks.routes[0]?.config).toEqual({ image: expect.objectContaining({ acl: "public-read" }) });
    expect(mocks.routes[1]?.config).toEqual({ image: expect.objectContaining({ acl: "private" }) });
  });

  it("authenticates each upload and passes only the local user id", async () => {
    mocks.requireUser.mockResolvedValue({ id: "local-user", clerkId: "user-1", role: "MEMBER" });
    await expect(mocks.routes[0]!.middleware!()).resolves.toEqual({ userId: "local-user" });
    await expect(mocks.routes[1]!.middleware!()).resolves.toEqual({ userId: "local-user" });
  });

  it("rejects a missing user defensively", async () => {
    mocks.requireUser.mockResolvedValue(null);
    await expect(mocks.routes[0]!.middleware!()).rejects.toThrow("Unauthorized");
  });

  it("records public uploads with their provider URL", async () => {
    mocks.createAttachment.mockResolvedValue({ id: "attachment", url: "https://app.ufs.sh/f/key" });
    await expect(mocks.routes[0]!.complete!({
      metadata: { userId: "local-user" },
      file: { key: "key", ufsUrl: "https://app.ufs.sh/f/key", name: "image.png", size: 42 },
    })).resolves.toEqual({ id: "attachment", url: "https://app.ufs.sh/f/key" });
    expect(mocks.createAttachment).toHaveBeenCalledWith({ data: expect.objectContaining({ access: "PUBLIC", context: "DRAFT" }) });
  });

  it("records private uploads without exposing their provider URL", async () => {
    mocks.createAttachment.mockResolvedValue({ id: "private-attachment", url: "https://secret.ufs.sh/f/key" });
    const result = await mocks.routes[1]!.complete!({
      metadata: { userId: "local-user" },
      file: { key: "key", ufsUrl: "https://secret.ufs.sh/f/key", name: "image.png", size: 42 },
    });
    expect(result).toEqual({ id: "private-attachment", url: "/api/attachments/private-attachment" });
    expect(JSON.stringify(result)).not.toContain("secret.ufs.sh");
    expect(mocks.createAttachment).toHaveBeenCalledWith({ data: expect.objectContaining({ access: "PRIVATE", url: "https://secret.ufs.sh/f/key" }) });
  });
});
