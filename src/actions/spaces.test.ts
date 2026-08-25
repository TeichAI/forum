import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  consumeUserMutation: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { category: { findMany: mocks.findMany, aggregate: mocks.aggregate, create: mocks.create, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeUserMutation: mocks.consumeUserMutation };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { createSpace, type SpaceActionState, updateSpacePostingPolicy } from "./spaces";

const initialState: SpaceActionState = { status: "idle" };

function form(values: Record<string, string | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
  mocks.findMany.mockResolvedValue([]);
  mocks.aggregate.mockResolvedValue({ _max: { position: null } });
  mocks.create.mockResolvedValue({ id: "space" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.consumeUserMutation.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, resetAt: new Date().toISOString(), remaining: 10 });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

describe("space creation", () => {
  it("stops space creation and policy writes when the staff limit is reached", async () => {
    mocks.consumeUserMutation.mockResolvedValue({
      allowed: false, retryAfterSeconds: 7, resetAt: "2026-08-25T12:00:07.000Z", remaining: 0,
    });

    await expect(createSpace(initialState, form({ name: "Ideas", description: "Discuss ideas", color: "#123456" })))
      .resolves.toEqual(expect.objectContaining({ status: "rate_limited", retryAfterSeconds: 7 }));
    await expect(updateSpacePostingPolicy({ status: "idle" }, form({ categoryId: "cm000000000000000000000004", postingPolicy: "OPEN" })))
      .resolves.toEqual(expect.objectContaining({ status: "rate_limited", retryAfterSeconds: 7 }));
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("normalizes, appends, revalidates, and opens a newly created space", async () => {
    mocks.findMany.mockResolvedValue([{ name: "Product & Ideas", slug: "product-ideas" }]);
    mocks.aggregate.mockResolvedValue({ _max: { position: 4 } });

    await expect(createSpace(initialState, form({
      name: "  Product Ideas  ", description: "  Discuss future products.  ", color: "#A1B2C3",
    }))).rejects.toThrow("redirect:/c/product-ideas-2");

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({ data: {
      name: "Product Ideas", description: "Discuss future products.", color: "#a1b2c3", postingPolicy: "OPEN", slug: "product-ideas-2", position: 5,
    } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("uses safe defaults for an empty generated slug and first position", async () => {
    await expect(createSpace(initialState, form({ name: "池塘", description: "社区讨论", color: "#0f766e" }))).rejects.toThrow("redirect:/c/space");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slug: "space", position: 0 }) }));
  });

  it("persists a validated posting policy", async () => {
    await expect(createSpace(initialState, form({
      name: "News", description: "Official news", color: "#123456", postingPolicy: "ANNOUNCEMENTS",
    }))).rejects.toThrow("redirect:/c/news");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ postingPolicy: "ANNOUNCEMENTS" }),
    }));
  });

  it("returns field errors without querying for invalid input", async () => {
    const result = await createSpace(initialState, form({ name: "x", description: "", color: "orange" }));

    expect(result).toEqual(expect.objectContaining({
      status: "error",
      fieldErrors: { name: expect.any(String), description: expect.any(String), color: expect.any(String) },
    }));
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an existing name case-insensitively", async () => {
    mocks.findMany.mockResolvedValue([{ name: "General", slug: "general" }]);
    const result = await createSpace(initialState, form({ name: "general", description: "Community talk", color: "#123456" }));

    expect(result).toEqual({ status: "error", message: "A space with that name already exists.", fieldErrors: { name: "Choose another name." } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns specific collision feedback and a generic persistence failure", async () => {
    mocks.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(createSpace(initialState, form({ name: "Ideas", description: "Discuss ideas", color: "#123456" }))).resolves.toEqual({
      status: "error", message: "That space name or URL is already in use.", fieldErrors: { name: "Choose another name." },
    });

    mocks.create.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(createSpace(initialState, form({ name: "Questions", description: "Ask questions", color: "#654321" }))).resolves.toEqual({
      status: "error", message: "We couldn’t create the space. Please try again.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("posting policy updates", () => {
  it("authorizes, updates an existing space, and revalidates the root layout", async () => {
    const result = await updateSpacePostingPolicy(
      { status: "idle" },
      form({ categoryId: "cm000000000000000000000004", postingPolicy: "ADMIN_ONLY" }),
    );

    expect(result).toEqual({ status: "success", message: "Posting permissions saved." });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "cm000000000000000000000004" },
      data: { postingPolicy: "ADMIN_ONLY" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns validation errors without writing", async () => {
    const result = await updateSpacePostingPolicy(
      { status: "idle" },
      form({ categoryId: "not-an-id", postingPolicy: "MEMBERS_ONLY" }),
    );
    expect(result).toEqual(expect.objectContaining({
      status: "error",
      fieldErrors: { categoryId: expect.any(String), postingPolicy: expect.any(String) },
    }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("reports a missing space without revalidating", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const result = await updateSpacePostingPolicy(
      { status: "idle" },
      form({ categoryId: "cm000000000000000000000004", postingPolicy: "OPEN" }),
    );
    expect(result).toEqual({ status: "error", message: "That space no longer exists." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
