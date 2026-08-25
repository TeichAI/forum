import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loaded: true,
  signedIn: true,
  user: null as unknown as Record<string, unknown>,
  session: { id: "session_current" },
}));

const mocks = vi.hoisted(() => ({
  sync: vi.fn(), signOut: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  setProfileImage: vi.fn(), reload: vi.fn(), createEmailAddress: vi.fn(), update: vi.fn(), updatePassword: vi.fn(), getSessions: vi.fn(),
  primaryDestroy: vi.fn(), newPrepare: vi.fn(), newAttempt: vi.fn(), newDestroy: vi.fn(), revoke: vi.fn(), fetch: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: state.loaded, isSignedIn: state.signedIn, user: state.user }),
  useSession: () => ({ session: state.session }),
  useClerk: () => ({ signOut: mocks.signOut }),
  useReverification: (fetcher: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
    const result = await fetcher(...args);
    return result instanceof Response ? result.json() : result;
  },
}));
vi.mock("@/actions/account", () => ({ syncAccountIdentity: mocks.sync }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("next/image", () => ({ default: ({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => createElement("img", { src, ...props }) }));

import { AccountSecurity } from "./account-security";

const primaryEmail = { id: "email_old", emailAddress: "old@example.com", destroy: mocks.primaryDestroy };
const newEmail = {
  id: "email_new",
  emailAddress: "new@example.com",
  verification: { status: "unverified" },
  prepareVerification: mocks.newPrepare,
  attemptVerification: mocks.newAttempt,
  destroy: mocks.newDestroy,
};
const currentSession = {
  id: "session_current", lastActiveAt: new Date("2026-08-24T12:00:00Z"), latestActivity: { browserName: "Safari", deviceType: "Mac", city: "Chicago", country: "US" }, revoke: vi.fn(),
};
const otherSession = {
  id: "session_other", lastActiveAt: new Date("2026-08-23T12:00:00Z"), latestActivity: { browserName: "Chrome", deviceType: "Windows", ipAddress: "192.0.2.1" }, revoke: mocks.revoke,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.loaded = true;
  state.signedIn = true;
  state.session = { id: "session_current" };
  state.user = {
    imageUrl: "https://example.com/avatar.png", hasImage: true,
    primaryEmailAddress: primaryEmail, primaryEmailAddressId: primaryEmail.id,
    emailAddresses: [primaryEmail], passwordEnabled: true, deleteSelfEnabled: true,
    setProfileImage: mocks.setProfileImage, reload: mocks.reload, createEmailAddress: mocks.createEmailAddress,
    update: mocks.update, updatePassword: mocks.updatePassword, getSessions: mocks.getSessions,
  };
  mocks.sync.mockResolvedValue({ ok: true, email: "new@example.com", imageUrl: "https://example.com/avatar.png" });
  mocks.reload.mockResolvedValue(state.user);
  mocks.createEmailAddress.mockResolvedValue(newEmail);
  mocks.newPrepare.mockResolvedValue(newEmail);
  mocks.newAttempt.mockResolvedValue({ ...newEmail, verification: { status: "verified" } });
  mocks.primaryDestroy.mockResolvedValue(undefined);
  mocks.newDestroy.mockResolvedValue(undefined);
  mocks.update.mockImplementation(async ({ primaryEmailAddressId }: { primaryEmailAddressId: string }) => {
    if (primaryEmailAddressId === newEmail.id) {
      state.user.primaryEmailAddressId = newEmail.id;
      state.user.primaryEmailAddress = newEmail;
    }
    return state.user;
  });
  mocks.updatePassword.mockResolvedValue(state.user);
  mocks.getSessions.mockResolvedValue([otherSession, currentSession]);
  mocks.revoke.mockResolvedValue(otherSession);
  mocks.signOut.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("AccountSecurity", () => {
  it("renders every custom account section without Clerk prebuilt UI", async () => {
    const { container } = render(<AccountSecurity displayName="Owen Example" username="owen" imageUrl={null} />);

    expect(screen.getByRole("heading", { name: "Profile photo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Login & security" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected accounts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active sessions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
    expect(screen.queryByText(/Clerk/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Safari on Mac")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("uploads and removes the profile photo and synchronizes the forum user", async () => {
    const user = userEvent.setup();
    render(<AccountSecurity displayName="Owen Example" username="owen" imageUrl={null} />);
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    await user.upload(screen.getByLabelText(/Choose photo/), file);
    await waitFor(() => expect(mocks.setProfileImage).toHaveBeenCalledWith({ file }));
    expect(mocks.sync).toHaveBeenCalled();
    expect(await screen.findByText("Profile photo updated.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocks.setProfileImage).toHaveBeenLastCalledWith({ file: null }));
    expect(await screen.findByText("Profile photo removed.")).toBeInTheDocument();
  });

  it("verifies a replacement email, makes it primary, and removes the old address", async () => {
    const user = userEvent.setup();
    render(<AccountSecurity displayName="Owen Example" username="owen" imageUrl={null} />);

    await user.type(screen.getByLabelText("New email address"), "NEW@example.com");
    await user.click(screen.getByRole("button", { name: "Change email" }));
    await waitFor(() => expect(mocks.createEmailAddress).toHaveBeenCalledWith({ email: "new@example.com" }));
    expect(mocks.newPrepare).toHaveBeenCalledWith({ strategy: "email_code" });

    await user.type(screen.getByLabelText("Verification code"), "424242");
    await user.click(screen.getByRole("button", { name: "Verify email" }));
    await waitFor(() => expect(mocks.newAttempt).toHaveBeenCalledWith({ code: "424242" }));
    expect(mocks.update).toHaveBeenCalledWith({ primaryEmailAddressId: "email_new" });
    expect(mocks.primaryDestroy).toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalled();
    expect(await screen.findByText("Email address updated.")).toBeInTheDocument();
  });

  it("validates password confirmation and revokes other sessions on success", async () => {
    const user = userEvent.setup();
    render(<AccountSecurity displayName="Owen Example" username="owen" imageUrl={null} />);

    await user.type(screen.getByLabelText("Current password"), "old-secret");
    await user.type(screen.getByLabelText("New password"), "new-secret-one");
    await user.type(screen.getByLabelText("Confirm new password"), "new-secret-two");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Those passwords do not match.");
    expect(mocks.updatePassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "new-secret-one");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith({ currentPassword: "old-secret", newPassword: "new-secret-one", signOutOfOtherSessions: true }));
    expect(await screen.findByText("Password updated. Other devices were signed out.")).toBeInTheDocument();
  });

  it("lists sessions, protects the current session, and revokes another device", async () => {
    const user = userEvent.setup();
    render(<AccountSecurity displayName="Owen Example" username="owen" imageUrl={null} />);
    await screen.findByText("Chrome on Windows");

    expect(screen.getAllByRole("button", { name: "Sign out device" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Sign out device" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledOnce());
    expect(await screen.findByText("That device was signed out.")).toBeInTheDocument();
  });

  it("requires an exact username before deleting and signs out after success", async () => {
    const user = userEvent.setup();
    render(<AccountSecurity displayName="Owen Example" username="owen" imageUrl={null} />);
    const confirmation = screen.getByLabelText(/Type owen to confirm/);
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();

    await user.type(confirmation, "owen");
    await user.click(button);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith("/api/account/delete", expect.objectContaining({ method: "POST", body: JSON.stringify({ confirmation: "owen" }) })));
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });

  it("shows provider loading, signed-out, and disabled-deletion states", async () => {
    state.loaded = false;
    const view = render(<AccountSecurity displayName="Owen" username="owen" imageUrl={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading account security");

    state.loaded = true;
    state.signedIn = false;
    view.rerender(<AccountSecurity displayName="Owen" username="owen" imageUrl={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("session ended");

    state.signedIn = true;
    state.user.deleteSelfEnabled = false;
    view.rerender(<AccountSecurity displayName="Owen" username="owen" imageUrl={null} />);
    expect(await screen.findByText("Self-service account deletion is disabled for this account.")).toBeInTheDocument();
  });
});
