import { beforeEach, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { $transaction: transaction } }));

import { withSerializableRetry } from "./transactions";

beforeEach(() => vi.clearAllMocks());

it("retries serialization conflicts at most three times", async () => {
  transaction.mockRejectedValueOnce({ code: "P2034" }).mockRejectedValueOnce({ code: "P2034" }).mockResolvedValue("ok");
  await expect(withSerializableRetry(async () => "unused")).resolves.toBe("ok");
  expect(transaction).toHaveBeenCalledTimes(3);
});

it("does not retry unrelated failures", async () => {
  transaction.mockRejectedValue(new Error("offline"));
  await expect(withSerializableRetry(async () => "unused")).rejects.toThrow("offline");
  expect(transaction).toHaveBeenCalledTimes(1);
});
