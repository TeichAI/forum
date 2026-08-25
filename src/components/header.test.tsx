import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ unread: vi.fn(), mode: vi.fn(), accountMenu: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { notification: { count: mocks.unread } } }));
vi.mock("@/lib/e2e-auth", () => ({ isE2ETestMode: mocks.mode }));
vi.mock("@/components/account-menu", () => ({ AccountMenu: (props: unknown) => { mocks.accountMenu(props); return <button>Custom account</button>; } }));
vi.mock("@/components/new-thread-trigger", () => ({ NewThreadTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));

import { Header } from "./header";

beforeEach(() => { vi.clearAllMocks(); mocks.mode.mockReturnValue(false); mocks.unread.mockResolvedValue(0); });

describe("Header", () => {
  it("renders signed-out navigation without querying notifications", async () => {
    const { container } = render(await Header({ viewer: null }));
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join Teich" })).toBeInTheDocument();
    expect(mocks.unread).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each([
    ["restricted", "Invitation only", "/sign-up"],
    ["waitlist", "Join waitlist", "/waitlist"],
  ] as const)("renders the %s access call to action", async (accessMode, label, href) => {
    render(await Header({ viewer: null, accessMode }));
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });

  it.each(["MEMBER", "MODERATOR", "ADMIN"])("renders %s controls and unread state", async (role) => {
    mocks.unread.mockResolvedValue(3);
    render(await Header({ viewer: { id: "user", displayName: "Owen Example", username: "owen", imageUrl: "https://img.clerk.com/avatar.png", role: role as "MEMBER" | "MODERATOR" | "ADMIN" } }));
    expect(screen.getByRole("button", { name: "New thread" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "3 unread notifications" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bookmarks" })).toBeInTheDocument();
    if (role === "MEMBER") expect(screen.queryByRole("link", { name: "Staff console" })).not.toBeInTheDocument();
    else expect(screen.getByRole("link", { name: "Staff console" })).toHaveAttribute("href", "/staff");
    expect(screen.getByRole("button", { name: "Custom account" })).toBeInTheDocument();
    expect(mocks.accountMenu).toHaveBeenCalledWith({ id: "user", displayName: "Owen Example", username: "owen", imageUrl: "https://img.clerk.com/avatar.png", role });
  });

  it("uses a deterministic account marker in E2E mode", async () => {
    mocks.mode.mockReturnValue(true);
    render(await Header({ viewer: { id: "user", displayName: "Test User", username: "test_user", imageUrl: null, role: "MEMBER" } }));
    expect(screen.getByText("Test user")).toBeInTheDocument();
    expect(screen.queryByText("Custom account")).not.toBeInTheDocument();
    expect(mocks.accountMenu).not.toHaveBeenCalled();
  });
});
