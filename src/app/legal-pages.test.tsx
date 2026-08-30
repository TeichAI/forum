import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import PrivacyPage, { metadata as privacyMetadata } from "./privacy/page";
import TermsPage, { metadata as termsMetadata } from "./terms/page";

describe("legal pages", () => {
  it("publishes complete, navigable Terms with route metadata", async () => {
    const { container } = render(<TermsPage />);
    expect(termsMetadata).toEqual(expect.objectContaining({ title: "Terms of Service" }));
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getAllByText("August 25, 2026", { selector: "dd" })).toHaveLength(2);

    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(within(article!).getAllByRole("heading", { level: 2 })).toHaveLength(18);
    expect(within(article!).getByRole("heading", { name: "Community standards and acceptable use" })).toBeInTheDocument();
    expect(within(article!).getByRole("heading", { name: "Your content and the license you give us" })).toBeInTheDocument();
    expect(within(article!).getByRole("heading", { name: "Limitation of liability" })).toBeInTheDocument();
    expect(container.querySelector('a[href="#community-rules"]')).toHaveTextContent("Community standards and acceptable use");
    expect(within(article!).getAllByRole("link", { name: "Privacy Policy" })[0]).toHaveAttribute("href", "/privacy");
    expect(within(article!).getByRole("link", { name: "Teich Mail" })).toHaveAttribute("href", "/mail");
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("publishes detailed privacy practices, rights, and disclosures", async () => {
    const { container } = render(<PrivacyPage />);
    expect(privacyMetadata).toEqual(expect.objectContaining({ title: "Privacy Policy" }));
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();

    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(within(article!).getAllByRole("heading", { level: 2 })).toHaveLength(18);
    expect(within(article!).getByRole("heading", { name: "Information we collect" })).toBeInTheDocument();
    expect(within(article!).getByRole("heading", { name: "Retention and account deletion" })).toBeInTheDocument();
    expect(within(article!).getByRole("heading", { name: "United States state privacy disclosures" })).toBeInTheDocument();
    expect(within(article!).getByText(/do not use private Mail or forum content to train/i)).toBeInTheDocument();
    expect(within(article!).getByText(/do not sell personal information for money/i)).toBeInTheDocument();
    expect(within(article!).getByText(/forum marks the local account deleted and clears its stored email address/i)).toBeInTheDocument();
    expect(within(article!).getByText(/searchable member directory is available only to active signed-in members/i)).toBeInTheDocument();
    expect(within(article!).getByText(/residual risk is accepted/i)).toBeInTheDocument();
    expect(screen.getByText("August 30, 2026", { selector: "dd" })).toBeInTheDocument();
    expect(container.querySelector('a[href="#retention"]')).toHaveTextContent("Retention and account deletion");
    expect(within(article!).getAllByRole("link", { name: "Terms of Service" })[0]).toHaveAttribute("href", "/terms");
    expect(within(article!).getByRole("link", { name: "Teich Mail" })).toHaveAttribute("href", "/mail");
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
