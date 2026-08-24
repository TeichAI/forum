import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClerkErrors, createSignUpHook } from "@/test/auth-clerk";
import { SignUpForm } from "./sign-up-form";

const state = vi.hoisted(() => ({ hook: null as unknown }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useSignUp: () => state.hook }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function renderForm(hook = createSignUpHook(), redirectUrl = "/") {
  state.hook = hook;
  return { hook, ...render(<SignUpForm redirectUrl={redirectUrl} />) };
}

async function enterAccount(user: ReturnType<typeof userEvent.setup>, options: { first?: string; last?: string; confirm?: string } = {}) {
  if (screen.queryByLabelText("First name") && options.first !== "") await user.type(screen.getByLabelText("First name"), options.first ?? "Ada");
  if (screen.queryByLabelText("Last name") && options.last !== "") await user.type(screen.getByLabelText("Last name"), options.last ?? "Pond");
  await user.type(screen.getByLabelText("Email address"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "secretpass");
  await user.type(screen.getByLabelText("Confirm password"), options.confirm ?? "secretpass");
}

function navigateOnFinalize(hook: ReturnType<typeof createSignUpHook>) {
  hook.signUp.finalize.mockImplementation(async (...args: unknown[]) => {
    const options = args[0] as { navigate: (args: { decorateUrl: (url: string) => string }) => void };
    options.navigate({ decorateUrl: vi.fn(() => "/settings?__clerk=1") });
    return { error: null };
  });
}

beforeEach(() => router.replace.mockReset());

describe("SignUpForm account details", () => {
  it("renders required and optional names and sends only populated values", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook({ signUp: { requiredFields: ["first_name"], optionalFields: ["last_name"], unverifiedFields: ["email_address"] } });
    renderForm(hook, "/settings");
    expect(screen.getByLabelText("First name")).toBeRequired();
    expect(screen.getByLabelText("Last name")).not.toBeRequired();
    await enterAccount(user, { last: "" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(hook.signUp.password).toHaveBeenCalledWith({ emailAddress: "ada@example.com", password: "secretpass", firstName: "Ada" });
    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
  });

  it("omits absent name fields, mounts CAPTCHA, and preserves the sign-in redirect", () => {
    const { container } = renderForm(createSignUpHook(), "/messages?thread=1");
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Last name")).not.toBeInTheDocument();
    expect(container.querySelector("#clerk-captcha")).toHaveAttribute("data-cl-size", "flexible");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in?redirect_url=%2Fmessages%3Fthread%3D1");
  });

  it("includes both names and legal acceptance when configured", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook({ signUp: { requiredFields: ["first_name", "last_name", "legal_accepted"], unverifiedFields: ["email_address"] } });
    renderForm(hook);
    await enterAccount(user);
    await user.click(screen.getByRole("checkbox", { name: /community guidelines/i }));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(hook.signUp.password).toHaveBeenCalledWith({
      emailAddress: "ada@example.com",
      password: "secretpass",
      firstName: "Ada",
      lastName: "Pond",
      legalAccepted: true,
    });
  });

  it("validates password confirmation before calling Clerk", async () => {
    const user = userEvent.setup();
    const { hook } = renderForm();
    await enterAccount(user, { confirm: "different" });
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("aria-describedby", "confirm-password-error");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Those passwords do not match.");
    expect(hook.signUp.password).not.toHaveBeenCalled();
  });

  it("requires legal acceptance before calling Clerk", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook({ signUp: { requiredFields: ["legal_accepted"] } });
    renderForm(hook);
    await enterAccount(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("accept the account terms");
    expect(hook.signUp.password).not.toHaveBeenCalled();
  });

  it("renders Clerk field/global errors accessibly", async () => {
    const hook = createSignUpHook({
      signUp: { requiredFields: ["first_name", "last_name"] },
      errors: createClerkErrors({
        firstName: { message: "First required." },
        lastName: { message: "Last required." },
        emailAddress: { longMessage: "Email invalid." },
        password: { longMessage: "Password weak." },
      }, [{ message: "Please review the form." }]),
    });
    const { container } = renderForm(hook);
    expect(screen.getByRole("alert")).toHaveTextContent("Please review the form.");
    expect(screen.getByLabelText("First name")).toHaveAttribute("aria-describedby", "first-name-error");
    expect(screen.getByLabelText("Last name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", "password-error");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows Clerk creation errors and their fallback", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook();
    hook.signUp.password.mockResolvedValueOnce({ error: { longMessage: "Email already exists." } });
    renderForm(hook);
    await enterAccount(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email already exists.");

    hook.signUp.password.mockResolvedValueOnce({ error: "bad" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't create your account.");
  });

  it("finalizes direct completion and reports finalization errors", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook({ signUp: { status: "complete", unverifiedFields: [] } });
    navigateOnFinalize(hook);
    renderForm(hook, "/settings");
    await enterAccount(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(router.replace).toHaveBeenCalledWith("/settings?__clerk=1");

    hook.signUp.finalize.mockResolvedValueOnce({ error: { message: "Session failed." } });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Session failed.");
  });

  it("rejects an unsafe decorated navigation destination", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook({ signUp: { status: "complete", unverifiedFields: [] } });
    hook.signUp.finalize.mockImplementation(async (...args: unknown[]) => {
      const options = args[0] as { navigate: (args: { decorateUrl: (url: string) => string }) => void };
      options.navigate({ decorateUrl: () => "//evil.example/phish" });
      return { error: null };
    });
    renderForm(hook, "/settings");
    await enterAccount(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("reports unsupported requirements and delivery errors", async () => {
    const user = userEvent.setup();
    const unsupported = createSignUpHook({ signUp: { unverifiedFields: ["phone_number"] } });
    renderForm(unsupported);
    await enterAccount(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("additional sign-up step");
  });

  it("disables submission and uses the default signin link while fetching", () => {
    renderForm(createSignUpHook({ fetchStatus: "fetching" }));
    expect(screen.getByRole("button", { name: "Creating account…" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });
});

describe("SignUpForm email verification", () => {
  async function enterVerification(hook: ReturnType<typeof createSignUpHook>, user: ReturnType<typeof userEvent.setup>) {
    const rendered = renderForm(hook);
    await enterAccount(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    return rendered;
  }

  it("shows send failures without leaving the account form", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook();
    hook.signUp.verifications.sendEmailCode.mockResolvedValue({ error: { message: "Could not send code." } });
    await enterVerification(hook, user);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not send code.");
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("normalizes codes and displays verification failures", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook({ errors: createClerkErrors({ code: { message: "Code required." } }) });
    hook.signUp.verifications.verifyEmailCode.mockResolvedValue({ error: { message: "Invalid code." } });
    await enterVerification(hook, user);
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Verification code")).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByLabelText("Verification code"), "42 42 42");
    await user.click(screen.getByRole("button", { name: "Verify and join" }));
    expect(hook.signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "424242" });
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid code.");
  });

  it("reports incomplete verification and finalizes completed signup", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook();
    await enterVerification(hook, user);
    await user.type(screen.getByLabelText("Verification code"), "424242");
    await user.click(screen.getByRole("button", { name: "Verify and join" }));
    expect(screen.getByRole("alert")).toHaveTextContent("still needs more information");

    hook.signUp.verifications.verifyEmailCode.mockImplementationOnce(async () => {
      hook.signUp.status = "complete";
      return { error: null };
    });
    await user.click(screen.getByRole("button", { name: "Verify and join" }));
    expect(hook.signUp.finalize).toHaveBeenCalledOnce();
  });

  it("resends, reports resend errors, and disables resend while busy", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook();
    const rendered = await enterVerification(hook, user);
    hook.signUp.verifications.sendEmailCode.mockClear();
    await user.click(screen.getByRole("button", { name: /Send another code/i }));
    expect(hook.signUp.verifications.sendEmailCode).toHaveBeenCalledOnce();
    hook.signUp.verifications.sendEmailCode.mockResolvedValueOnce({ error: { message: "Resend failed." } });
    await user.click(screen.getByRole("button", { name: /Send another code/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Resend failed.");

    hook.fetchStatus = "fetching";
    state.hook = hook;
    rendered.rerender(<SignUpForm redirectUrl="/" />);
    expect(screen.getByRole("button", { name: /Send another code/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
  });

  it("resets Clerk and returns to account entry", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook();
    await enterVerification(hook, user);
    await user.type(screen.getByLabelText("Verification code"), "123");
    await user.click(screen.getByRole("button", { name: "Change email" }));
    expect(hook.signUp.reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("is accessible in the verification state", async () => {
    const user = userEvent.setup();
    const hook = createSignUpHook();
    const { container } = await enterVerification(hook, user);
    expect(await axe(container)).toHaveNoViolations();
  });
});
