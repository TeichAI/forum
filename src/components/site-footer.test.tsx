import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

it("links every page to the legal documents through the site footer", async () => {
  const { container } = render(<SiteFooter />);
  expect(screen.getByText("Built with the Teich community.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
  expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  expect(await axe(container)).toHaveNoViolations();
});
