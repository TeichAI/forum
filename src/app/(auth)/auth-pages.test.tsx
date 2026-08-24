import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage, { metadata as signInMetadata } from "./sign-in/[[...sign-in]]/page";
import SignUpPage, { metadata as signUpMetadata } from "./sign-up/[[...sign-up]]/page";
import WaitlistPage, { metadata as waitlistMetadata } from "./waitlist/page";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  accessMode: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/access-mode", () => ({ getClerkAccessMode: mocks.accessMode }));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) => <main><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p>{children}</main>,
}));
vi.mock("@/components/auth/sign-in-form", () => ({ SignInForm: ({ redirectUrl, ssoContinuation, accessMode }: { redirectUrl: string; ssoContinuation?: boolean; accessMode?: string }) => <div data-testid="signin" data-redirect={redirectUrl} data-sso={String(Boolean(ssoContinuation))} data-mode={accessMode} /> }));
vi.mock("@/components/auth/sign-up-form", () => ({ SignUpForm: ({ redirectUrl, ssoContinuation }: { redirectUrl: string; ssoContinuation?: boolean }) => <div data-testid="signup" data-redirect={redirectUrl} data-sso={String(Boolean(ssoContinuation))} /> }));
vi.mock("@/components/auth/invitation-form", () => ({ InvitationForm: ({ ticket, accountStatus, redirectUrl }: { ticket: string; accountStatus: string; redirectUrl: string }) => <div data-testid="invitation" data-ticket={ticket} data-status={accountStatus} data-redirect={redirectUrl} /> }));
vi.mock("@/components/auth/waitlist-form", () => ({ WaitlistForm: () => <div data-testid="waitlist">Waitlist form</div> }));

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.redirect.mockClear();
  mocks.accessMode.mockReturnValue("public");
});

describe("authentication route pages", () => {
  it("exports concise page metadata", () => {
    expect(signInMetadata).toEqual({ title: "Sign in" });
    expect(signUpMetadata).toEqual({ title: "Join" });
    expect(waitlistMetadata).toEqual({ title: "Join the waitlist" });
  });

  it("renders the anonymous sign-in route with a valid local redirect", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    render(await SignInPage({ searchParams: Promise.resolve({ redirect_url: "/settings?tab=profile" }) }));
    expect(screen.getByRole("heading", { name: "Sign in to Teich" })).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByTestId("signin")).toHaveAttribute("data-redirect", "/settings?tab=profile");
    expect(screen.getByTestId("signin")).toHaveAttribute("data-mode", "public");
  });

  it("renders invitation tickets from either auth entry point without accepting array values", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const first = render(await SignUpPage({ searchParams: Promise.resolve({ __clerk_ticket: "secret", __clerk_status: "sign_up", redirect_url: "/settings" }) }));
    expect(screen.getByTestId("invitation")).toHaveAttribute("data-ticket", "secret");
    expect(screen.getByTestId("invitation")).toHaveAttribute("data-status", "sign_up");
    expect(screen.getByTestId("invitation")).toHaveAttribute("data-redirect", "/settings");
    first.unmount();

    const second = render(await SignInPage({ searchParams: Promise.resolve({ __clerk_ticket: "existing", __clerk_status: "sign_in" }) }));
    expect(screen.getByTestId("invitation")).toHaveAttribute("data-status", "sign_in");
    second.unmount();

    const defaultSignIn = render(await SignInPage({ searchParams: Promise.resolve({ __clerk_ticket: "existing-without-status" }) }));
    expect(screen.getByTestId("invitation")).toHaveAttribute("data-status", "sign_in");
    defaultSignIn.unmount();

    render(await SignUpPage({ searchParams: Promise.resolve({ __clerk_ticket: ["one", "two"] }) }));
    expect(screen.queryByTestId("invitation")).not.toBeInTheDocument();
    expect(screen.getByTestId("signup")).toBeInTheDocument();
  });

  it("shows stable outcomes for completed and malformed invitation links", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const completed = render(await SignUpPage({ searchParams: Promise.resolve({ __clerk_ticket: "secret", __clerk_status: "complete" }) }));
    expect(screen.getByRole("heading", { name: "Your invitation is ready" })).toBeInTheDocument();
    completed.unmount();

    render(await SignUpPage({ searchParams: Promise.resolve({ __clerk_ticket: "secret", __clerk_status: "unknown" }) }));
    expect(screen.getByRole("heading", { name: "This invitation link is invalid" })).toBeInTheDocument();
  });

  it("routes ordinary signup according to the configured access mode", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.accessMode.mockReturnValueOnce("restricted");
    const restricted = render(await SignUpPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "An invitation is required" })).toBeInTheDocument();
    restricted.unmount();

    mocks.accessMode.mockReturnValueOnce("waitlist");
    await expect(SignUpPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/waitlist");
  });

  it("renders the waitlist only in waitlist mode and redirects signed-in users", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.accessMode.mockReturnValue("waitlist");
    render(await WaitlistPage());
    expect(screen.getByTestId("waitlist")).toBeInTheDocument();

    mocks.accessMode.mockReturnValue("public");
    await expect(WaitlistPage()).rejects.toThrow("REDIRECT:/sign-up");
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    await expect(WaitlistPage()).rejects.toThrow("REDIRECT:/");
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

  it("passes only the explicit SSO continuation marker to custom forms", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const first = render(await SignInPage({ searchParams: Promise.resolve({ sso_continuation: "1" }) }));
    expect(screen.getByTestId("signin")).toHaveAttribute("data-sso", "true");
    first.unmount();

    render(await SignUpPage({ searchParams: Promise.resolve({ sso_continuation: ["1"] }) }));
    expect(screen.getByTestId("signup")).toHaveAttribute("data-sso", "false");
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
