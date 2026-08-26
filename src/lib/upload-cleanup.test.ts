import { expect, it, vi } from "vitest";
import { cleanupUnclaimedUploads } from "./upload-cleanup";

it("claims stale rows before deleting their storage objects", async () => {
  const client = { attachment: { findMany: vi.fn().mockResolvedValue([{ id: "one", key: "file-one" }]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const storage = { deleteFiles: vi.fn().mockResolvedValue({ success: true }) };
  await expect(cleanupUnclaimedUploads({ storage, client: client as never, now: new Date("2026-08-25T12:00:00Z") })).resolves.toEqual({ removed: 1 });
  expect(storage.deleteFiles).toHaveBeenCalledWith(["file-one"]);
  expect(client.attachment.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(storage.deleteFiles.mock.invocationCallOrder[0]!);
  expect(client.attachment.deleteMany).toHaveBeenCalledWith({ where: { id: "one", context: { in: ["DRAFT", "MAIL_DRAFT"] }, createdAt: { lt: new Date("2026-08-24T12:00:00Z") } } });
});

it("does not delete storage for a draft claimed after the stale scan", async () => {
  const client = { attachment: { findMany: vi.fn().mockResolvedValue([{ id: "one", key: "file-one" }, { id: "two", key: "file-two" }]), deleteMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }) } };
  const storage = { deleteFiles: vi.fn().mockResolvedValue({ success: true }) };

  await expect(cleanupUnclaimedUploads({ storage, client: client as never })).resolves.toEqual({ removed: 1 });

  expect(storage.deleteFiles).toHaveBeenCalledWith(["file-two"]);
});

it("is idempotent when no stale rows remain", async () => {
  const client = { attachment: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() } };
  const storage = { deleteFiles: vi.fn() };
  await expect(cleanupUnclaimedUploads({ storage, client: client as never })).resolves.toEqual({ removed: 0 });
  expect(storage.deleteFiles).not.toHaveBeenCalled();
});
