import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: mocks.enabled }));
vi.mock("@/lib/db", () => ({ db: { attachment: { findMany: mocks.findMany, updateMany: mocks.updateMany } } }));
import { claimAttachments } from "./attachments";

beforeEach(() => { vi.clearAllMocks(); mocks.enabled.mockReturnValue(true); });

describe("claimAttachments", () => {
  it("skips disabled uploads and unreferenced files", async () => {
    mocks.enabled.mockReturnValue(false);
    await claimAttachments("body", "user", "MAIL_ENTRY", "entry");
    expect(mocks.findMany).not.toHaveBeenCalled();
    mocks.enabled.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([{ id: "unused", url: "https://unused", access: "PRIVATE" }]);
    await claimAttachments("body", "user", "MAIL_ENTRY", "entry");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("claims temporary and draft-owned referenced files", async () => {
    mocks.findMany.mockResolvedValue([{ id: "used", url: "https://provider-secret", access: "PRIVATE" }, { id: "unused", url: "https://unused", access: "PRIVATE" }]);
    await claimAttachments("![image](/api/attachments/used)", "user", "MAIL_ENTRY", "entry", "draft");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ access: "PRIVATE", OR: [{ context: "DRAFT" }, { context: "MAIL_DRAFT", targetId: "draft" }] }) }));
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["used"] } }, data: { context: "MAIL_ENTRY", targetId: "entry" } });
  });

  it("never lets forum content claim a private upload", async () => {
    mocks.findMany.mockResolvedValue([]);
    await claimAttachments("![image](/api/attachments/private)", "user", "THREAD", "thread");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ access: "PUBLIC" }) }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
