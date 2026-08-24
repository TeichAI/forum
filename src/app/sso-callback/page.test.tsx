import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SsoCallbackPage, { metadata } from "./page";

vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
}));
vi.mock("@/components/auth/sso-callback", () => ({
  SsoCallback: ({ redirectUrl, origin }: { redirectUrl: string; origin: string }) => <div data-testid="callback" data-redirect={redirectUrl} data-origin={origin} />,
}));

describe("SSO callback page", () => {
  it("exports metadata and passes sanitized callback context", async () => {
    expect(metadata).toEqual({ title: "Finishing authentication" });
    render(await SsoCallbackPage({ searchParams: Promise.resolve({ redirect_url: "/settings", origin: "sign-up" }) }));
    expect(screen.getByRole("heading", { name: "Connecting your account" })).toBeInTheDocument();
    expect(screen.getByTestId("callback")).toHaveAttribute("data-redirect", "/settings");
    expect(screen.getByTestId("callback")).toHaveAttribute("data-origin", "sign-up");
  });

  it("falls back to sign-in and root for invalid or array parameters", async () => {
    render(await SsoCallbackPage({ searchParams: Promise.resolve({ redirect_url: "//evil.example", origin: ["sign-up"] }) }));
    expect(screen.getByTestId("callback")).toHaveAttribute("data-redirect", "/");
    expect(screen.getByTestId("callback")).toHaveAttribute("data-origin", "sign-in");
  });
});
