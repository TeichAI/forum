import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewThreadDialogProvider } from "./new-thread-dialog";
import { NewThreadTrigger } from "./new-thread-trigger";

const navigation = vi.hoisted(() => ({ pathname: "/c/general", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("@/actions/forum", () => ({ createThread: vi.fn() }));

beforeEach(() => {
  navigation.pathname = "/c/general";
  navigation.push.mockReset();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function close(this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close", { bubbles: true }));
      }),
    },
  });
});

afterEach(() => {
  const prototype = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
  delete prototype.showModal;
  delete prototype.close;
});

function Composer({ isAuthenticated = true }: { isAuthenticated?: boolean }) {
  return (
    <NewThreadDialogProvider
      isAuthenticated={isAuthenticated}
      categories={[{ id: "general", name: "General" }, { id: "help", name: "Help" }]}
      uploadsEnabled={false}
    >
      <NewThreadTrigger className="header-trigger">Header new thread</NewThreadTrigger>
      <NewThreadTrigger categoryId="help">Category new thread</NewThreadTrigger>
    </NewThreadDialogProvider>
  );
}

describe("NewThreadDialogProvider", () => {
  it("opens accessibly with category preselection and focuses the title", async () => {
    const user = userEvent.setup();
    const { container } = render(<Composer />);

    await user.click(screen.getByRole("button", { name: "Category new thread" }));

    const dialog = screen.getByRole("dialog", { name: "Start a discussion" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByLabelText("Space")).toHaveValue("help");
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("closes with the X, restores focus, and clears every draft field", async () => {
    const user = userEvent.setup();
    render(<Composer />);
    const trigger = screen.getByRole("button", { name: "Category new thread" });
    await user.click(trigger);
    await user.type(screen.getByLabelText("Title"), "A drafted title");
    await user.type(screen.getByLabelText(/Tags/), "draft");
    await user.type(screen.getByLabelText("Post"), "Draft body");

    await user.click(screen.getByRole("button", { name: "Close new thread dialog" }));

    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Space")).toHaveValue("");
    expect(screen.getByLabelText(/Tags/)).toHaveValue("");
    expect(screen.getByLabelText("Post")).toHaveValue("");
  });

  it("closes on Escape and when the pathname changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Composer />);
    const trigger = screen.getByRole("button", { name: "Header new thread" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Start a discussion" });

    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    navigation.pathname = "/t/a-new-thread";
    rerender(<Composer />);
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });

  it("routes signed-out triggers to sign-in without opening a dialog", async () => {
    const user = userEvent.setup();
    render(<Composer isAuthenticated={false} />);

    await user.click(screen.getByRole("button", { name: "Header new thread" }));

    expect(navigation.push).toHaveBeenCalledWith("/sign-in");
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
  });
});
