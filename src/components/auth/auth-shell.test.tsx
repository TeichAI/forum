import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { AuthShell } from "./auth-shell";

describe("AuthShell", () => {
  it("renders a single-column form shell with navigation and an accessible heading structure", async () => {
    const { container } = render(<AuthShell eyebrow="Welcome" title="Sign in" description="Continue the conversation."><button>Form action</button></AuthShell>);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Continue the conversation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Form action" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Teich Forum home" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByText("A thoughtful place for ideas to take root.")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
