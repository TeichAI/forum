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
    mocks.findMany.mockResolvedValue([{ id: "unused", url: "https://unused" }]);
    await claimAttachments("body", "user", "MAIL_ENTRY", "entry");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("claims temporary and draft-owned referenced files", async () => {
    mocks.findMany.mockResolvedValue([{ id: "used", url: "https://used" }, { id: "unused", url: "https://unused" }]);
    await claimAttachments("![image](https://used)", "user", "MAIL_ENTRY", "entry", "draft");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ context: "DRAFT" }, { context: "MAIL_DRAFT", targetId: "draft" }] }) }));
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["used"] } }, data: { context: "MAIL_ENTRY", targetId: "entry" } });
  });
});
