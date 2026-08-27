import { render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSignInHook, createSignUpHook } from "@/test/auth-clerk";
import { SsoCallback } from "./sso-callback";

const state = vi.hoisted(() => ({
  clerk: null as unknown,
  signInHook: null as unknown,
  signUpHook: null as unknown,
}));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => state.clerk,
  useSignIn: () => state.signInHook,
  useSignUp: () => state.signUpHook,
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function setup(options: {
  signIn?: Record<string, unknown>;
  signUp?: Record<string, unknown>;
  loaded?: boolean;
} = {}) {
  const signInHook = createSignInHook({ signIn: options.signIn });
  const signUpHook = createSignUpHook({ signUp: options.signUp });
  const clerk = { loaded: options.loaded ?? true, setActive: vi.fn(async (...args: unknown[]) => { void args; }) };
  state.signInHook = signInHook;
  state.signUpHook = signUpHook;
  state.clerk = clerk;
  return { clerk, signInHook, signUpHook };
}

function navigateOnFinalize(resource: { finalize: ReturnType<typeof vi.fn> }, decorated = "/settings?__clerk=1") {
  resource.finalize.mockImplementation(async (...args: unknown[]) => {
    const options = args[0] as { navigate: (params: { decorateUrl: (url: string) => string }) => void };
    options.navigate({ decorateUrl: () => decorated });
    return { error: null };
  });
}

beforeEach(() => {
  router.replace.mockReset();
});

describe("SsoCallback", () => {
  it("finalizes a completed sign-in and sanitizes Clerk's decorated destination", async () => {
    const { signInHook } = setup({ signIn: { status: "complete" } });
    navigateOnFinalize(signInHook.signIn, "//evil.example");
    const { container } = render(<SsoCallback redirectUrl="/settings" origin="sign-in" />);

    await waitFor(() => expect(signInHook.signIn.finalize).toHaveBeenCalledOnce());
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(container.querySelector("#clerk-captcha")).toHaveAttribute("data-cl-size", "flexible");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("transfers an existing-user sign-up into sign-in and resumes MFA", async () => {
    const { signInHook } = setup({
      signIn: { status: "needs_second_factor" },
      signUp: { isTransferable: true, unverifiedFields: [] },
    });
    render(<SsoCallback redirectUrl="/messages?thread=1" origin="sign-up" />);

    await waitFor(() => expect(signInHook.signIn.create).toHaveBeenCalledWith({ transfer: true }));
    expect(router.replace).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fmessages%3Fthread%3D1&sso_continuation=1");
  });

  it("transfers a missing-user sign-in into sign-up for missing requirements", async () => {
    const { signUpHook } = setup({
      signIn: { isTransferable: true },
      signUp: { status: "missing_requirements", missingFields: ["first_name"], unverifiedFields: [] },
    });
    render(<SsoCallback redirectUrl="/settings" origin="sign-in" />);

    await waitFor(() => expect(signUpHook.signUp.create).toHaveBeenCalledWith({ transfer: true }));
    expect(router.replace).toHaveBeenCalledWith("/sign-up?redirect_url=%2Fsettings&sso_continuation=1");
  });

  it("finalizes a completed transferred sign-up", async () => {
    const { signUpHook } = setup({
      signIn: { isTransferable: true },
      signUp: { status: "complete", unverifiedFields: [] },
    });
    navigateOnFinalize(signUpHook.signUp);
    render(<SsoCallback redirectUrl="/settings" origin="sign-in" />);

    await waitFor(() => expect(signUpHook.signUp.finalize).toHaveBeenCalledOnce());
    expect(router.replace).toHaveBeenCalledWith("/settings?__clerk=1");
  });

  it.each(["needs_second_factor", "needs_client_trust", "needs_new_password"])("returns a direct %s attempt to sign-in continuation", async (status) => {
    setup({ signIn: { status } });
    render(<SsoCallback redirectUrl="/" origin="sign-in" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in?sso_continuation=1"));
  });

  it("activates an existing session and uses Clerk's decorated navigation", async () => {
    const { clerk } = setup({ signIn: { existingSession: { sessionId: "sess_existing" } } });
    clerk.setActive.mockImplementationOnce(async (...args: unknown[]) => {
      const options = args[0] as { navigate: (params: { decorateUrl: (url: string) => string }) => Promise<void> };
      await options.navigate({ decorateUrl: () => "/settings?active=1" });
    });
    render(<SsoCallback redirectUrl="/settings" origin="sign-in" />);

    await waitFor(() => expect(clerk.setActive).toHaveBeenCalledWith(expect.objectContaining({ session: "sess_existing" })));
    expect(router.replace).toHaveBeenCalledWith("/settings?active=1");
  });

  it("routes direct sign-up requirements and ordinary first-factor sign-in states", async () => {
    setup({ signUp: { missingFields: ["last_name"], unverifiedFields: [] } });
    const first = render(<SsoCallback redirectUrl="/settings" origin="sign-up" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-up?redirect_url=%2Fsettings&sso_continuation=1"));
    first.unmount();

    router.replace.mockReset();
    setup({ signIn: { status: "needs_identifier" }, signUp: { status: "abandoned", unverifiedFields: [] } });
    render(<SsoCallback redirectUrl="/" origin="sign-in" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("surfaces transfer, finalization, and unsupported-state errors with a retry link", async () => {
    const { signUpHook } = setup({ signIn: { isTransferable: true }, signUp: { unverifiedFields: [] } });
    signUpHook.signUp.create.mockResolvedValueOnce({ error: { longMessage: "Transfer failed." } });
    const first = render(<SsoCallback redirectUrl="/settings" origin="sign-in" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Transfer failed.");
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute("href", "/sign-in?redirect_url=%2Fsettings");
    first.unmount();

    setup({ signIn: { status: "needs_protect_check" }, signUp: { status: "abandoned", unverifiedFields: [] } });
    render(<SsoCallback redirectUrl="/" origin="sign-up" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't resume social authentication");
    expect(screen.getByRole("link", { name: "Return to sign up" })).toHaveAttribute("href", "/sign-up");
  });

  it("waits until Clerk has loaded", () => {
    const { signInHook } = setup({ signIn: { status: "complete" }, loaded: false });
    render(<SsoCallback redirectUrl="/" origin="sign-in" />);
    expect(signInHook.signIn.finalize).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Finishing social authentication");
  });
});
