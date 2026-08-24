import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pending = vi.hoisted(() => ({ value: false }));
vi.mock("react-dom", async (importOriginal) => ({ ...await importOriginal<typeof import("react-dom")>(), useFormStatus: () => ({ pending: pending.value }) }));
vi.mock("next/image", () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement("img", { alt: "", ...props }) }));

import { Avatar } from "./avatar";
import { SubmitButton } from "./submit-button";

beforeEach(() => { pending.value = false; });

describe("basic UI", () => {
  it("renders image and initial avatar variants", () => {
    const { container, rerender } = render(<Avatar src="https://example.com/avatar.png" name="Owen" className="large" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/avatar.png");
    rerender(<Avatar name="owen" />);
    expect(screen.getByText("O")).toHaveAttribute("aria-hidden", "true");
  });

  it("switches submit content and disabled state while pending", () => {
    const { rerender } = render(<SubmitButton>Save</SubmitButton>);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    pending.value = true;
    rerender(<SubmitButton pendingLabel="Working" className="custom">Save</SubmitButton>);
    expect(screen.getByRole("button", { name: "Working" })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveClass("custom");
  });
});
