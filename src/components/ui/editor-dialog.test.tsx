import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorDialog } from "./editor-dialog";

beforeEach(() => {
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

describe("EditorDialog", () => {
  it("opens an accessible dialog and closes it with the header button", async () => {
    const user = userEvent.setup();
    const { container } = render(<EditorDialog title="Edit reply"><p>Editor content</p></EditorDialog>);
    const trigger = screen.getByRole("button", { name: "Edit" });

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Edit reply" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Close edit dialog" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Close edit dialog" }));

    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("closes on the native dialog cancel event", async () => {
    const user = userEvent.setup();
    render(<EditorDialog title="Edit thread"><p>Editor content</p></EditorDialog>);
    const trigger = screen.getByRole("button", { name: "Edit" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Edit thread" });

    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));

    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });
});
