import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const authState = vi.hoisted(() => ({ admin: null as User | null }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => authState.admin) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));

import { createSpace, type SpaceActionState } from "./spaces";
import { db } from "@/lib/db";
import { createTestCategory, createTestUser } from "@/test/integration-factories";

const initialState: SpaceActionState = { status: "idle" };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => { authState.admin = null; });

describe("space actions against PostgreSQL", () => {
  it("persists an appended space with a unique generated URL", async () => {
    authState.admin = await createTestUser({ role: "ADMIN" });
    await createTestCategory({ name: "Product & Ideas", slug: "product-ideas", position: 4 });

    await expect(createSpace(initialState, form({
      name: "Product Ideas", description: "Discuss future products.", color: "#A1B2C3",
    }))).rejects.toThrow("redirect:/c/product-ideas-2");

    expect(await db.category.findUnique({ where: { slug: "product-ideas-2" } })).toEqual(expect.objectContaining({
      name: "Product Ideas", description: "Discuss future products.", color: "#a1b2c3", position: 5,
    }));
  });
});
