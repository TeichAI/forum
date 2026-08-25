import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSpace: vi.fn() }));
vi.mock("@/actions/spaces", () => ({ createSpace: mocks.createSpace }));

import { CreateSpaceDialog } from "./create-space-dialog";

beforeEach(() => {
  mocks.createSpace.mockReset().mockResolvedValue({ status: "idle" });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); }),
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

describe("CreateSpaceDialog", () => {
  it("opens accessibly, focuses the name, restores focus, and resets drafts", async () => {
    const user = userEvent.setup();
    const { container } = render(<CreateSpaceDialog />);
    const trigger = screen.getByRole("button", { name: "Add space" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Create a space" })).toHaveAttribute("open");
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
    await user.type(screen.getByLabelText("Name"), "Draft space");
    expect(screen.getByRole("radio", { name: /Open/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Announcements/ })).not.toBeChecked();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Close create space dialog" }));
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Color")).toHaveValue("#0f766e");
    expect(screen.getByRole("radio", { name: /Open/ })).toBeChecked();
  });

  it("announces returned field errors and marks their controls", async () => {
    mocks.createSpace.mockResolvedValue({
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { name: "Choose another name." },
    });
    const user = userEvent.setup();
    render(<CreateSpaceDialog />);
    await user.click(screen.getByRole("button", { name: "Add space" }));
    await user.type(screen.getByLabelText("Name"), "Ideas");
    await user.type(screen.getByLabelText("Description"), "Discuss ideas");
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#123456" } });
    await user.click(screen.getByRole("button", { name: "Create space" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the highlighted fields");
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose another name.")).toHaveAttribute("id", "new-space-name-error");
  });

  it("disables submission and exposes its pending label", async () => {
    let finish!: (state: { status: "idle" }) => void;
    mocks.createSpace.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<CreateSpaceDialog />);
    await user.click(screen.getByRole("button", { name: "Add space" }));
    await user.type(screen.getByLabelText("Name"), "Ideas");
    await user.type(screen.getByLabelText("Description"), "Discuss ideas");
    await user.click(screen.getByRole("button", { name: "Create space" }));

    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    await act(async () => finish({ status: "idle" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create space" })).toBeEnabled());
  });

  it("submits the selected posting policy", async () => {
    const user = userEvent.setup();
    render(<CreateSpaceDialog />);
    await user.click(screen.getByRole("button", { name: "Add space" }));
    await user.type(screen.getByLabelText("Name"), "News");
    await user.type(screen.getByLabelText("Description"), "Official updates");
    await user.click(screen.getByRole("radio", { name: /Announcements/ }));
    await user.click(screen.getByRole("button", { name: "Create space" }));

    await waitFor(() => expect(mocks.createSpace).toHaveBeenCalled());
    const submitted = mocks.createSpace.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("postingPolicy")).toBe("ANNOUNCEMENTS");
  });
});
