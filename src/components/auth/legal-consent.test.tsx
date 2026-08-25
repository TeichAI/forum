import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { expect, it, vi } from "vitest";
import { LegalConsent } from "./legal-consent";

it("makes consent explicit and links both policies", async () => {
  const onChange = vi.fn();
  const { container } = render(<LegalConsent checked={false} onChange={onChange} />);
  const checkbox = screen.getByRole("checkbox", { name: /Terms of Service.*community standards.*Privacy Policy/i });
  expect(checkbox).toBeRequired();
  expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
  expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await userEvent.click(checkbox);
  expect(onChange).toHaveBeenCalledWith(true);
  expect(await axe(container)).toHaveNoViolations();
});
