import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffNav } from "./staff-nav";

const pathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: pathname }));

describe("StaffNav", () => {
  beforeEach(() => pathname.mockReturnValue("/staff/reports"));

  it("shows only moderation modules to moderators and marks the active route", () => {
    render(<StaffNav role="MODERATOR" />);
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Members" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Spaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Moderation presets" })).not.toBeInTheDocument();
  });

  it("adds every administration module for administrators", () => {
    render(<StaffNav role="ADMIN" />);
    expect(screen.getByRole("link", { name: "Spaces" })).toHaveAttribute("href", "/staff/spaces");
    expect(screen.getByRole("link", { name: "Tags" })).toHaveAttribute("href", "/staff/tags");
    expect(screen.getByRole("link", { name: "Moderation presets" })).toHaveAttribute("href", "/staff/settings/moderation");
  });
});
