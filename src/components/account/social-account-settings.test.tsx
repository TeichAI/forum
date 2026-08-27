import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as unknown as Record<string, unknown> }));
const mocks = vi.hoisted(() => ({
  createExternalAccount: vi.fn(),
  reload: vi.fn(),
  push: vi.fn(),
  destroy: vi.fn(),
  reauthorize: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: state.user }),
  useSession: () => ({ session: null }),
  useReverification: (fetcher: (...args: unknown[]) => Promise<unknown>) => fetcher,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { ReverificationProvider } from "./reverification";
import { SocialAccountSettings } from "./social-account-settings";

function verification(status: "unverified" | "verified" | "failed", url = "https://github.com/login/oauth/authorize") {
  return {
    status,
    error: status === "failed" ? { longMessage: "GitHub authorization expired." } : null,
    externalVerificationRedirectURL: new URL(url),
  };
}

function externalAccount(options: { status?: "unverified" | "verified" | "failed"; username?: string; emailAddress?: string; provider?: "github" | "huggingface"; verificationUrl?: string } = {}) {
  const status = options.status ?? "verified";
  const provider = options.provider ?? "github";
  return {
    id: `external_${provider}`,
    provider,
    username: options.username ?? "pond-builder",
    emailAddress: options.emailAddress ?? "pond@example.com",
    verification: verification(status, options.verificationUrl),
    accountIdentifier: vi.fn(() => options.username ?? options.emailAddress ?? "pond-builder"),
    destroy: mocks.destroy,
    reauthorize: mocks.reauthorize,
  };
}

function renderSettings() {
  return render(<ReverificationProvider><SocialAccountSettings /></ReverificationProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = {
    externalAccounts: [],
    createExternalAccount: mocks.createExternalAccount,
    reload: mocks.reload,
  };
  mocks.reload.mockResolvedValue(state.user);
  mocks.destroy.mockResolvedValue(undefined);
});

describe("SocialAccountSettings", () => {
  it("starts a GitHub connection with Clerk and follows its verification URL", async () => {
    const created = externalAccount({ status: "unverified" });
    mocks.createExternalAccount.mockResolvedValue(created);
    const user = userEvent.setup();
    const { container } = renderSettings();

    expect(screen.getByText("Use GitHub to sign in to this forum account.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect GitHub" }));

    await waitFor(() => expect(mocks.createExternalAccount).toHaveBeenCalledWith({ strategy: "oauth_github", redirectUrl: "/settings" }));
    expect(mocks.push).toHaveBeenCalledWith("https://github.com/login/oauth/authorize");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("starts a Hugging Face connection with Clerk and renders the official logo", async () => {
    const created = externalAccount({
      provider: "huggingface",
      status: "unverified",
      verificationUrl: "https://huggingface.co/oauth/authorize",
    });
    mocks.createExternalAccount.mockResolvedValue(created);
    const user = userEvent.setup();
    renderSettings();

    const connectButton = screen.getByRole("button", { name: "Connect Hugging Face" });
    expect(connectButton.closest("div.rounded-2xl")?.querySelector("img")).toHaveAttribute("src", "/hugging-face-logo.svg");
    await user.click(connectButton);

    await waitFor(() => expect(mocks.createExternalAccount).toHaveBeenCalledWith({ strategy: "oauth_huggingface", redirectUrl: "/settings" }));
    expect(mocks.push).toHaveBeenCalledWith("https://huggingface.co/oauth/authorize");
  });

  it("shows Clerk and missing-redirect errors without leaving the button busy", async () => {
    const user = userEvent.setup();
    mocks.createExternalAccount.mockRejectedValueOnce({ errors: [{ longMessage: "GitHub is unavailable." }] });
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Connect GitHub" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("GitHub is unavailable.");
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeEnabled();

    mocks.createExternalAccount.mockResolvedValueOnce({ ...externalAccount({ status: "unverified" }), verification: { ...verification("unverified"), externalVerificationRedirectURL: null } });
    await user.click(screen.getByRole("button", { name: "Connect GitHub" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("GitHub did not provide a verification link");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("renders the linked identity and disconnects only after confirmation", async () => {
    const account = externalAccount({ username: "teich-user" });
    state.user.externalAccounts = [account];
    const user = userEvent.setup();
    renderSettings();

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("teich-user")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect GitHub" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByRole("group", { name: "Confirm GitHub disconnect" })).toBeInTheDocument();
    expect(mocks.destroy).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Disconnect GitHub?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    expect(mocks.reload).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("GitHub disconnected.");
  });

  it("keeps the connection and reports Clerk errors when disconnecting is unsafe", async () => {
    state.user.externalAccounts = [externalAccount()];
    mocks.destroy.mockRejectedValueOnce({ longMessage: "You must keep at least one sign-in method." });
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You must keep at least one sign-in method.");
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it("explains and retries an incomplete GitHub connection", async () => {
    const account = externalAccount({ status: "failed" });
    state.user.externalAccounts = [account];
    const refreshed = { ...account, verification: verification("unverified", "https://github.com/login/oauth/retry") };
    mocks.reauthorize.mockResolvedValue(refreshed);
    const user = userEvent.setup();
    renderSettings();

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("GitHub authorization expired.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry connection" }));

    await waitFor(() => expect(mocks.reauthorize).toHaveBeenCalledWith({ redirectUrl: "/settings" }));
    expect(mocks.push).toHaveBeenCalledWith("https://github.com/login/oauth/retry");
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
