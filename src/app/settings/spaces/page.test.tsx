import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  policyForm: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { category: { findMany: mocks.findMany } } }));
vi.mock("@/components/account/space-posting-policy-form", () => ({
  SpacePostingPolicyForm: ({ category }: { category: { name: string } }) => {
    mocks.policyForm(category);
    return <section>{category.name}</section>;
  },
}));

import SpaceSettingsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
  mocks.findMany.mockResolvedValue([
    { id: "space", name: "News", description: "Updates", color: "#0f766e", postingPolicy: "ANNOUNCEMENTS" },
  ]);
});

describe("SpaceSettingsPage", () => {
  it("requires an administrator and lists spaces with the policy guide", async () => {
    render(await SpaceSettingsPage());

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, color: true, postingPolicy: true },
    });
    expect(screen.getByRole("heading", { name: "Space settings" })).toBeInTheDocument();
    expect(screen.getByText("Changes take effect immediately", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Announcements")).toBeInTheDocument();
    expect(screen.getByText("Admin only")).toBeInTheDocument();
    expect(screen.getByText("News")).toBeInTheDocument();
  });

  it("shows an empty state when there are no spaces", async () => {
    mocks.findMany.mockResolvedValue([]);
    render(await SpaceSettingsPage());
    expect(screen.getByRole("heading", { name: "No spaces yet" })).toBeInTheDocument();
  });

  it("does not query spaces when the admin guard rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect:/"));
    await expect(SpaceSettingsPage()).rejects.toThrow("redirect:/");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
