import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { CodeInput, FieldMessage, FormAlert, PasswordInput, SubmitButton } from "./auth-controls";

describe("authentication controls", () => {
  it("toggles password visibility and forwards input props", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<><label htmlFor="secret">Secret</label><PasswordInput id="secret" name="secret" className="custom" error="Required" value="hunter2" onChange={onChange} /></>);
    const input = screen.getByLabelText("Secret");

    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("name", "secret");
    expect(input).toHaveClass("custom");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("disables the visibility control with its input", () => {
    render(<PasswordInput aria-label="Password" disabled />);
    expect(screen.getByRole("button", { name: "Show password" })).toBeDisabled();
  });

  it("renders optional messages and accessible alerts only when populated", async () => {
    const { container, rerender } = render(<><FieldMessage /><FormAlert /></>);
    expect(container).toBeEmptyDOMElement();

    rerender(<><FieldMessage id="field-error">Fix this field</FieldMessage><FormAlert>Try again</FormAlert></>);
    expect(screen.getByText("Fix this field")).toHaveAttribute("id", "field-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Try again");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("switches submit content and disabled state while busy", () => {
    const { rerender } = render(<SubmitButton busy={false} busyLabel="Working…">Continue</SubmitButton>);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    rerender(<SubmitButton busy busyLabel="Working…">Continue</SubmitButton>);
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });

  it("applies OTP defaults while allowing backup-code overrides and custom classes", () => {
    const { rerender } = render(<CodeInput aria-label="Code" className="extra" />);
    let input = screen.getByLabelText("Code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "6");
    expect(input).toHaveClass("extra");

    rerender(<CodeInput aria-label="Backup code" inputMode="text" maxLength={64} />);
    input = screen.getByLabelText("Backup code");
    expect(input).toHaveAttribute("inputmode", "text");
    expect(input).toHaveAttribute("maxlength", "64");
  });
});
