import { act, createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  clerkUser: undefined as undefined | { imageUrl: string },
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mocks.signOut }),
  useUser: () => ({ user: mocks.clerkUser }),
}));

vi.mock("next/image", () => ({
  default: ({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => createElement("img", { src, ...props }),
}));

import { AccountMenu } from "./account-menu";

const viewer = {
  id: "viewer_123",
  displayName: "Owen Example",
  username: "owen",
  imageUrl: "https://img.clerk.com/server-avatar.png",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clerkUser = undefined;
  mocks.signOut.mockResolvedValue(undefined);
});

describe("AccountMenu", () => {
  it("renders the stored avatar eagerly and its initial fallback before Clerk loads", () => {
    const { container } = render(<AccountMenu {...viewer} />);
    const trigger = screen.getByRole("button", { name: "Account menu for Owen Example" });
    const image = container.querySelector("img");

    expect(trigger).toHaveClass("h-10", "w-10");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(image).toHaveAttribute("src", viewer.imageUrl);
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveClass("absolute", "h-10", "w-10");
    expect(screen.getByText("O")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders only the colored fallback when there is no stored image or the image fails", () => {
    const { container, rerender } = render(<AccountMenu {...viewer} imageUrl={null} />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("O")).toHaveStyle({ color: "var(--brand)" });

    rerender(<AccountMenu key="with-image" {...viewer} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("O")).toBeInTheDocument();
  });

  it("refreshes the avatar from Clerk client state after the initial render", async () => {
    const { container, rerender } = render(<AccountMenu {...viewer} />);
    expect(container.querySelector("img")).toHaveAttribute("src", viewer.imageUrl);

    mocks.clerkUser = { imageUrl: "https://img.clerk.com/client-avatar.png" };
    rerender(<AccountMenu {...viewer} />);

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", mocks.clerkUser?.imageUrl));
  });

  it("shows the identity and all account actions with natural tab order", async () => {
    const user = userEvent.setup();
    render(<AccountMenu {...viewer} />);

    const trigger = screen.getByRole("button", { name: "Account menu for Owen Example" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByText("Owen Example")).toBeInTheDocument();
    expect(screen.getByText("@owen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByText("Account & security")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
  });

  it("dismisses the dropdown when account settings is selected", async () => {
    const user = userEvent.setup();
    render(<AccountMenu {...viewer} />);

    await user.click(screen.getByRole("button", { name: "Account menu for Owen Example" }));
    const settings = screen.getByRole("link", { name: "Account settings" });
    settings.addEventListener("click", (event) => event.preventDefault());
    await user.click(settings);

    expect(screen.queryByRole("navigation", { name: "Account menu" })).not.toBeInTheDocument();
  });

  it("signs out at the home page and exposes the pending state", async () => {
    let finishSignOut!: () => void;
    mocks.signOut.mockReturnValue(new Promise<void>((resolve) => { finishSignOut = resolve; }));
    const user = userEvent.setup();
    render(<AccountMenu {...viewer} />);

    await user.click(screen.getByRole("button", { name: "Account menu for Owen Example" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
    expect(screen.getByRole("button", { name: "Signing out…" })).toBeDisabled();
    await act(async () => finishSignOut());
  });

  it("recovers from a sign-out failure and announces the error", async () => {
    mocks.signOut.mockRejectedValue(new Error("network unavailable"));
    const user = userEvent.setup();
    render(<AccountMenu {...viewer} />);

    await user.click(screen.getByRole("button", { name: "Account menu for Owen Example" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t sign you out. Please try again.");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("toggles from the trigger and dismisses on an outside pointer press", async () => {
    const user = userEvent.setup();
    render(<><AccountMenu {...viewer} /><button type="button">Outside</button></>);
    const trigger = screen.getByRole("button", { name: "Account menu for Owen Example" });

    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("navigation", { name: "Account menu" })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("navigation", { name: "Account menu" })).not.toBeInTheDocument();
  });

  it("dismisses on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<AccountMenu {...viewer} />);
    const trigger = screen.getByRole("button", { name: "Account menu for Owen Example" });

    await user.click(trigger);
    screen.getByRole("link", { name: "Account settings" }).focus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("navigation", { name: "Account menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("has no detectable accessibility violations when closed or open", async () => {
    const user = userEvent.setup();
    const { container } = render(<AccountMenu {...viewer} />);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Account menu for Owen Example" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
