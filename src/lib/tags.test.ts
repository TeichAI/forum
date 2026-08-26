import { expect, it, vi } from "vitest";
import { normalizeTagSlugs, resolveCanonicalTags } from "./tags";

it("normalizes and deduplicates requested tags", () => {
  expect(normalizeTagSlugs(["Next JS", "next-js", " Prisma "])).toEqual(["next-js", "prisma"]);
});

it("resolves aliases before creating genuinely unknown tags", async () => {
  const canonical = { id: "canonical", slug: "new", name: "New" };
  const tx = {
    tagAlias: { findMany: vi.fn().mockResolvedValue([{ slug: "old", tag: canonical }]) },
    tag: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "fresh", slug: "fresh", name: "fresh" }),
    },
  };
  await expect(resolveCanonicalTags(tx as never, ["old", "fresh", "old"])).resolves.toEqual([canonical, { id: "fresh", slug: "fresh", name: "fresh" }]);
  expect(tx.tag.create).toHaveBeenCalledTimes(1);
});
