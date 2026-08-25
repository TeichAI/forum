import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSignInHook, createSignUpHook } from "@/test/auth-clerk";
import { InvitationForm } from "./invitation-form";

const state = vi.hoisted(() => ({ signIn: null as unknown, signUp: null as unknown }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useSignIn: () => state.signIn, useSignUp: () => state.signUp }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function renderForm(accountStatus: "sign_in" | "sign_up", signIn = createSignInHook(), signUp = createSignUpHook()) {
  state.signIn = signIn;
  state.signUp = signUp;
  return { signIn, signUp, ...render(<InvitationForm ticket="ticket_secret" accountStatus={accountStatus} redirectUrl="/settings" />) };
}

function navigateOnFinalize(resource: { finalize: ReturnType<typeof vi.fn> }, decorated = "/settings?__clerk=1") {
  resource.finalize.mockImplementation(async (...args: unknown[]) => {
    const options = args[0] as { navigate: (args: { decorateUrl: (url: string) => string }) => void };
    options.navigate({ decorateUrl: vi.fn(() => decorated) });
    return { error: null };
  });
}

beforeEach(() => { router.replace.mockReset(); });

describe("InvitationForm sign-up", () => {
  it("validates and completes the configured invited-user requirements", async () => {
    const user = userEvent.setup();
    const signUp = createSignUpHook({
      signUp: {
        requiredFields: ["first_name", "last_name", "password", "legal_accepted"],
        missingFields: ["first_name", "last_name", "password", "legal_accepted"],
        unverifiedFields: [],
      },
    });
    signUp.signUp.create.mockImplementation(async () => {
      signUp.signUp.status = "complete";
      signUp.signUp.missingFields = [];
      return { error: null };
    });
    navigateOnFinalize(signUp.signUp);
    const { container } = renderForm("sign_up", createSignInHook(), signUp);

    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");

    await user.type(screen.getByLabelText("First name"), "Ada");
    await user.type(screen.getByLabelText("Last name"), "Lovelace");
    await user.type(screen.getByLabelText("Password", { exact: true }), "secretpass");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Those passwords do not match.");
    expect(signUp.signUp.create).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "secretpass");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(signUp.signUp.create).toHaveBeenCalledWith({ strategy: "ticket", ticket: "ticket_secret", firstName: "Ada", lastName: "Lovelace", password: "secretpass", legalAccepted: true });
    expect(signUp.signUp.finalize).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledWith("/settings?__clerk=1");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("surfaces invalid tickets and unsupported remaining requirements", async () => {
    const user = userEvent.setup();
    const signUp = createSignUpHook({ signUp: { unverifiedFields: [], requiredFields: [], optionalFields: [] } });
    signUp.signUp.create.mockResolvedValueOnce({ error: { message: "Invitation expired." } });
    renderForm("sign_up", createSignInHook(), signUp);
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Invitation expired.");

    signUp.signUp.create.mockImplementationOnce(async () => {
      signUp.signUp.missingFields = ["phone_number"];
      return { error: null };
    });
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("does not support");
  });
});

describe("InvitationForm sign-in", () => {
  it("redeems and finalizes an existing-user ticket automatically", async () => {
    const signIn = createSignInHook();
    signIn.signIn.ticket.mockImplementation(async () => {
      signIn.signIn.status = "complete";
      return { error: null };
    });
    navigateOnFinalize(signIn.signIn);
    renderForm("sign_in", signIn);
    await waitFor(() => expect(signIn.signIn.ticket).toHaveBeenCalledWith({ ticket: "ticket_secret" }));
    await waitFor(() => expect(signIn.signIn.finalize).toHaveBeenCalledOnce());
    expect(router.replace).toHaveBeenCalledWith("/settings?__clerk=1");
  });

  it("continues ticket sign-in through MFA", async () => {
    const user = userEvent.setup();
    const signIn = createSignInHook({ signIn: { supportedSecondFactors: [{ strategy: "totp" }] } });
    signIn.signIn.ticket.mockImplementation(async () => {
      signIn.signIn.status = "needs_second_factor";
      return { error: null };
    });
    signIn.signIn.mfa.verifyTOTP.mockImplementation(async () => {
      signIn.signIn.status = "complete";
      return { error: null };
    });
    navigateOnFinalize(signIn.signIn);
    renderForm("sign_in", signIn);
    expect(await screen.findByRole("heading", { name: "One more step" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Verification code"), "424242");
    await user.click(screen.getByRole("button", { name: "Verify invitation" }));
    expect(signIn.signIn.mfa.verifyTOTP).toHaveBeenCalledWith({ code: "424242" });
    expect(signIn.signIn.finalize).toHaveBeenCalledOnce();
  });

  it("renders a recoverable invalid-ticket error", async () => {
    const signIn = createSignInHook();
    signIn.signIn.ticket.mockResolvedValue({ error: { longMessage: "Invitation revoked." } });
    renderForm("sign_in", signIn);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invitation revoked.");
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute("href", "/sign-in?redirect_url=%2Fsettings");
  });
});
