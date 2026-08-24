import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage, { metadata as signInMetadata } from "./sign-in/[[...sign-in]]/page";
import SignUpPage, { metadata as signUpMetadata } from "./sign-up/[[...sign-up]]/page";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) => <main><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p>{children}</main>,
}));
vi.mock("@/components/auth/sign-in-form", () => ({ SignInForm: ({ redirectUrl }: { redirectUrl: string }) => <div data-testid="signin" data-redirect={redirectUrl} /> }));
vi.mock("@/components/auth/sign-up-form", () => ({ SignUpForm: ({ redirectUrl }: { redirectUrl: string }) => <div data-testid="signup" data-redirect={redirectUrl} /> }));

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.redirect.mockClear();
});

describe("authentication route pages", () => {
  it("exports concise page metadata", () => {
    expect(signInMetadata).toEqual({ title: "Sign in" });
    expect(signUpMetadata).toEqual({ title: "Join" });
  });

  it("renders the anonymous sign-in route with a valid local redirect", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    render(await SignInPage({ searchParams: Promise.resolve({ redirect_url: "/settings?tab=profile" }) }));
    expect(screen.getByRole("heading", { name: "Sign in to Teich" })).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByTestId("signin")).toHaveAttribute("data-redirect", "/settings?tab=profile");
  });

  it("sanitizes hostile and array redirects before rendering either form", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const first = render(await SignInPage({ searchParams: Promise.resolve({ redirect_url: "//evil.example" }) }));
    expect(screen.getByTestId("signin")).toHaveAttribute("data-redirect", "/");
    first.unmount();

    render(await SignUpPage({ searchParams: Promise.resolve({ redirect_url: ["/settings", "/messages"] }) }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByText("Join the community")).toBeInTheDocument();
    expect(screen.getByTestId("signup")).toHaveAttribute("data-redirect", "/");
  });

  it.each([
    ["sign-in", SignInPage],
    ["sign-up", SignUpPage],
  ] as const)("redirects signed-in users away from %s", async (_name, page) => {
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    await expect(page({ searchParams: Promise.resolve({ redirect_url: "/settings" }) })).rejects.toThrow("REDIRECT:/settings");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings");
  });
});
