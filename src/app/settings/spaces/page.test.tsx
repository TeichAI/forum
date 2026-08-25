import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import SpaceSettingsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

describe("SpaceSettingsPage redirect", () => {
  it("requires an administrator and redirects to the staff console", async () => {
    await expect(SpaceSettingsPage()).rejects.toThrow("redirect:/staff/spaces");
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
  });

  it("does not query spaces when the admin guard rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect:/"));
    await expect(SpaceSettingsPage()).rejects.toThrow("redirect:/");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
