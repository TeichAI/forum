import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAttachment: vi.fn(),
  middleware: undefined as undefined | (() => Promise<unknown>),
  complete: undefined as undefined | ((input: unknown) => Promise<unknown>),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ db: { attachment: { create: mocks.createAttachment } } }));
vi.mock("uploadthing/next", () => ({
  createUploadthing: () => () => ({
    middleware(callback: () => Promise<unknown>) { mocks.middleware = callback; return this; },
    onUploadComplete(callback: (input: unknown) => Promise<unknown>) { mocks.complete = callback; return this; },
  }),
}));

describe("UploadThing router contract", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.requireUser.mockReset();
    mocks.createAttachment.mockReset();
    await import("./core");
  });

  it("authenticates an upload and passes only the local user id", async () => {
    mocks.requireUser.mockResolvedValue({ id: "local-user" });
    await expect(mocks.middleware!()).resolves.toEqual({ userId: "local-user" });
  });

  it("rejects a missing user defensively", async () => {
    mocks.requireUser.mockResolvedValue(null);
    await expect(mocks.middleware!()).rejects.toThrow("Unauthorized");
  });

  it("records completed files as draft attachments", async () => {
    mocks.createAttachment.mockResolvedValue({ id: "attachment", url: "https://app.ufs.sh/f/key" });
    await expect(mocks.complete!({
      metadata: { userId: "local-user" },
      file: { key: "key", ufsUrl: "https://app.ufs.sh/f/key", name: "image.png", size: 42 },
    })).resolves.toEqual({ id: "attachment", url: "https://app.ufs.sh/f/key" });
    expect(mocks.createAttachment).toHaveBeenCalledWith({ data: {
      userId: "local-user", key: "key", url: "https://app.ufs.sh/f/key", name: "image.png", size: 42, context: "DRAFT",
    } });
  });
});
