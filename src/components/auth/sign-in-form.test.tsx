import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClerkErrors, createSignInHook } from "@/test/auth-clerk";
import { SignInForm } from "./sign-in-form";

const state = vi.hoisted(() => ({ hook: null as unknown }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useSignIn: () => state.hook }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function renderForm(hook = createSignInHook(), redirectUrl = "/", ssoContinuation = false) {
  state.hook = hook;
  return { hook, ...render(<SignInForm redirectUrl={redirectUrl} ssoContinuation={ssoContinuation} />) };
}

async function enterCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email address"), "member@example.com");
  await user.type(screen.getByLabelText("Password"), "secretpass");
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await enterCredentials(user);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

function navigateOnFinalize(hook: ReturnType<typeof createSignInHook>, decorated = "/settings?__clerk=1") {
  hook.signIn.finalize.mockImplementation(async (...args: unknown[]) => {
    const options = args[0] as { navigate: (args: { decorateUrl: (url: string) => string }) => void };
    options.navigate({ decorateUrl: vi.fn(() => decorated) });
    return { error: null };
  });
}

beforeEach(() => {
  router.replace.mockReset();
});

describe("SignInForm password flow", () => {
  it("signs in, finalizes the Clerk session, and safely navigates to a decorated local redirect", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { status: "complete" } });
    navigateOnFinalize(hook);
    renderForm(hook, "/settings");

    await submitCredentials(user);

    expect(hook.signIn.password).toHaveBeenCalledWith({ emailAddress: "member@example.com", password: "secretpass" });
    expect(hook.signIn.finalize).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledWith("/settings?__clerk=1");
  });

  it("shows password rejection, Clerk field/global errors, and preserves the signup redirect", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({
      errors: createClerkErrors(
        { identifier: { longMessage: "Use a valid email." }, password: { message: "Password is required." } },
        [{ longMessage: "Clerk is unavailable." }],
      ),
    });
    hook.signIn.password.mockResolvedValue({ error: { message: "No match." } });
    const { container } = renderForm(hook, "/messages?thread=1");

    expect(screen.getByRole("alert")).toHaveTextContent("Clerk is unavailable.");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", "password-error");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up?redirect_url=%2Fmessages%3Fthread%3D1");
    await submitCredentials(user);
    expect(screen.getByRole("alert")).toHaveTextContent("No match.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("uses the password fallback for an unstructured error", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook();
    hook.signIn.password.mockResolvedValue({ error: "bad" });
    renderForm(hook);
    await submitCredentials(user);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't sign you in with those details.");
  });

  it("reports unsupported first-factor statuses", async () => {
    const user = userEvent.setup();
    renderForm(createSignInHook({ signIn: { status: "needs_identifier" } }));
    await submitCredentials(user);
    expect(screen.getByRole("alert")).toHaveTextContent("additional sign-in step");
  });

  it("reports finalization failures", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { status: "complete" } });
    hook.signIn.finalize.mockResolvedValue({ error: { longMessage: "Session could not be created." } });
    renderForm(hook);
    await submitCredentials(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Session could not be created.");
  });

  it("rejects an unsafe decorated navigation destination", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { status: "complete" } });
    navigateOnFinalize(hook, "https://evil.example/phish");
    renderForm(hook, "/settings");
    await submitCredentials(user);
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("disables submission and shows its busy label while fetching", () => {
    renderForm(createSignInHook({ fetchStatus: "fetching" }));
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up");
  });
});

describe("SignInForm GitHub SSO", () => {
  it("starts GitHub SSO with sanitized destinations and accessible social UI", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook();
    const { container } = renderForm(hook, "/messages?thread=1");

    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));

    expect(hook.signIn.sso).toHaveBeenCalledWith({
      strategy: "oauth_github",
      redirectUrl: "/messages?thread=1",
      redirectCallbackUrl: "/sso-callback?origin=sign-in&redirect_url=%2Fmessages%3Fthread%3D1",
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("surfaces SSO errors and disables all actions while Clerk is fetching", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook();
    hook.signIn.sso.mockResolvedValueOnce({ error: { longMessage: "GitHub is unavailable." } });
    const rendered = renderForm(hook);
    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(screen.getByRole("alert")).toHaveTextContent("GitHub is unavailable.");

    hook.fetchStatus = "fetching";
    state.hook = hook;
    rendered.rerender(<SignInForm redirectUrl="/" />);
    expect(screen.getByRole("button", { name: "Connecting to GitHub…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  });

  it("resumes MFA and new-password states without showing social connections", async () => {
    const mfa = createSignInHook({ signIn: { status: "needs_second_factor", supportedSecondFactors: [{ strategy: "totp" }] } });
    const first = renderForm(mfa, "/settings", true);
    expect(await screen.findByRole("heading", { name: "One more step" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /GitHub/ })).not.toBeInTheDocument();
    first.unmount();

    renderForm(createSignInHook({ signIn: { status: "needs_new_password" } }), "/settings", true);
    expect(await screen.findByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /GitHub/ })).not.toBeInTheDocument();
  });

  it("shows a recoverable error for an unsupported callback state", async () => {
    renderForm(createSignInHook({ signIn: { status: "needs_protect_check" } }), "/", true);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be resumed");
  });
});

describe("SignInForm password reset", () => {
  it("requires an email before starting", async () => {
    const user = userEvent.setup();
    const { hook } = renderForm();
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email address first");
    expect(hook.signIn.create).not.toHaveBeenCalled();
  });

  it("shows create and send-code failures", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook();
    hook.signIn.create.mockResolvedValueOnce({ error: { longMessage: "Account not found." } });
    renderForm(hook);
    await user.type(screen.getByLabelText("Email address"), "missing@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Account not found.");

    hook.signIn.create.mockResolvedValueOnce({ error: null });
    hook.signIn.resetPasswordEmailCode.sendCode.mockResolvedValueOnce({ error: { message: "Email failed." } });
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email failed.");
  });

  it("sends a reset code, normalizes whitespace, and reports verification errors", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook();
    hook.signIn.resetPasswordEmailCode.verifyCode.mockResolvedValue({ error: { message: "Wrong code." } });
    const { container } = renderForm(hook);
    await user.type(screen.getByLabelText("Email address"), "reset@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText("reset@example.com")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Verification code"), "12 34 56");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(hook.signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: "123456" });
    expect(screen.getByRole("alert")).toHaveTextContent("Wrong code.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("reports an unsupported state after code verification", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { status: "needs_first_factor" } });
    renderForm(hook);
    await user.type(screen.getByLabelText("Email address"), "reset@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Verification code"), "424242");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("password reset needs an additional step");
  });

  it("moves to a new password and surfaces field and save errors", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({
      signIn: { status: "needs_new_password" },
      errors: createClerkErrors({ password: { longMessage: "Use a stronger password." } }),
    });
    renderForm(hook);
    await user.type(screen.getByLabelText("Email address"), "reset@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Verification code"), "424242");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-describedby", "new-password-error");

    hook.signIn.resetPasswordEmailCode.submitPassword.mockResolvedValueOnce({ error: { message: "Cannot reuse that password." } });
    await user.type(screen.getByLabelText("New password"), "newsecret");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot reuse that password.");
  });

  it("finalizes a completed reset and reports incomplete completion", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { status: "needs_new_password" } });
    renderForm(hook);
    await user.type(screen.getByLabelText("Email address"), "reset@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Verification code"), "424242");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    await user.type(screen.getByLabelText("New password"), "newsecret");

    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("password was saved, but sign-in could not be completed");

    hook.signIn.resetPasswordEmailCode.submitPassword.mockImplementationOnce(async () => {
      hook.signIn.status = "complete";
      return { error: null };
    });
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(hook.signIn.finalize).toHaveBeenCalledOnce();
  });

  it("resets Clerk state and returns to the password form", async () => {
    const user = userEvent.setup();
    const { hook } = renderForm();
    await user.type(screen.getByLabelText("Email address"), "reset@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Verification code"), "123");
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(hook.signIn.reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("SignInForm MFA and device trust", () => {
  async function enterMfa(hook: ReturnType<typeof createSignInHook>, user: ReturnType<typeof userEvent.setup>, status = "needs_second_factor") {
    hook.signIn.password.mockImplementation(async () => {
      hook.signIn.status = status;
      return { error: null };
    });
    const rendered = renderForm(hook);
    await submitCredentials(user);
    return rendered;
  }

  it.each([
    ["email_code", "verifyEmailCode", "sent to your account"],
    ["phone_code", "verifyPhoneCode", "sent to your account"],
    ["totp", "verifyTOTP", "authenticator"],
    ["backup_code", "verifyBackupCode", "backup"],
  ] as const)("verifies the %s strategy", async (strategy, method, copy) => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { supportedSecondFactors: [{ strategy }] } });
    await enterMfa(hook, user, strategy === "phone_code" ? "needs_client_trust" : "needs_second_factor");
    expect(screen.getByText(new RegExp(copy, "i"))).toBeInTheDocument();
    const input = screen.getByLabelText("Verification code");
    if (strategy === "backup_code") {
      expect(input).toHaveAttribute("maxlength", "64");
      expect(input).toHaveAttribute("inputmode", "text");
    }
    await user.type(input, strategy === "backup_code" ? "BACK UP 123" : "424242");
    hook.signIn.mfa[method].mockImplementationOnce(async () => {
      hook.signIn.status = "complete";
      return { error: null };
    });
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(hook.signIn.mfa[method]).toHaveBeenCalledWith({ code: strategy === "backup_code" ? "BACKUP123" : "424242" });
    expect(hook.signIn.finalize).toHaveBeenCalledOnce();
  });

  it("prioritizes email over phone, TOTP, and backup strategies", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { supportedSecondFactors: [{ strategy: "backup_code" }, { strategy: "totp" }, { strategy: "phone_code" }, { strategy: "email_code" }] } });
    await enterMfa(hook, user);
    expect(hook.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
    expect(hook.signIn.mfa.sendPhoneCode).not.toHaveBeenCalled();
  });

  it("surfaces email and phone code delivery failures", async () => {
    const user = userEvent.setup();
    const emailHook = createSignInHook({ signIn: { supportedSecondFactors: [{ strategy: "email_code" }] } });
    emailHook.signIn.mfa.sendEmailCode.mockResolvedValue({ error: { message: "Email delivery failed." } });
    const first = await enterMfa(emailHook, user);
    expect(screen.getByRole("alert")).toHaveTextContent("Email delivery failed.");
    first.unmount();

    const phoneHook = createSignInHook({ signIn: { supportedSecondFactors: [{ strategy: "phone_code" }] } });
    phoneHook.signIn.mfa.sendPhoneCode.mockResolvedValue({ error: { message: "SMS delivery failed." } });
    await enterMfa(phoneHook, userEvent.setup());
    expect(screen.getByRole("alert")).toHaveTextContent("SMS delivery failed.");
  });

  it("rejects unsupported factors", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({ signIn: { supportedSecondFactors: [{ strategy: "passkey" }] } });
    await enterMfa(hook, user);
    expect(screen.getByRole("alert")).toHaveTextContent("does not support yet");
  });

  it("shows MFA verification failures and incomplete states accessibly", async () => {
    const user = userEvent.setup();
    const hook = createSignInHook({
      signIn: { supportedSecondFactors: [{ strategy: "totp" }] },
      errors: createClerkErrors({ code: { longMessage: "Code has expired." } }),
    });
    await enterMfa(hook, user);
    const container = screen.getByRole("button", { name: "Verify code" }).parentElement!.parentElement!;
    expect(screen.getByLabelText("Verification code")).toHaveAttribute("aria-invalid", "true");
    hook.signIn.mfa.verifyTOTP.mockResolvedValueOnce({ error: { message: "Bad TOTP." } });
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Bad TOTP.");
    expect(await axe(container)).toHaveNoViolations();

    hook.signIn.mfa.verifyTOTP.mockResolvedValueOnce({ error: null });
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("sign-in still needs more information");
  });
});
