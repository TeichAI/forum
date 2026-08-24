import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClerkErrors, createWaitlistHook } from "@/test/auth-clerk";
import { WaitlistForm } from "./waitlist-form";

const state = vi.hoisted(() => ({ hook: null as unknown }));
vi.mock("@clerk/nextjs", () => ({ useWaitlist: () => state.hook }));

function renderForm(hook = createWaitlistHook()) {
  state.hook = hook;
  return { hook, ...render(<WaitlistForm />) };
}

beforeEach(() => { state.hook = null; });

describe("WaitlistForm", () => {
  it("joins with a trimmed email and renders accessibly", async () => {
    const user = userEvent.setup();
    const { hook, container } = renderForm();
    await user.type(screen.getByLabelText("Email address"), "  member@example.com  ");
    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(hook.waitlist.join).toHaveBeenCalledWith({ emailAddress: "member@example.com" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows field, global, and returned errors", async () => {
    const user = userEvent.setup();
    const hook = createWaitlistHook({
      errors: createClerkErrors({ emailAddress: { longMessage: "Use a valid email." } }, [{ message: "Waitlist unavailable." }]),
    });
    hook.waitlist.join.mockResolvedValue({ error: { longMessage: "Try again later." } });
    renderForm(hook);
    expect(screen.getByRole("alert")).toHaveTextContent("Waitlist unavailable.");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByLabelText("Email address"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Try again later.");
  });

  it("shows the pending and joined states", () => {
    const pending = renderForm(createWaitlistHook({ fetchStatus: "fetching" }));
    expect(screen.getByRole("button", { name: "Joining…" })).toBeDisabled();
    pending.unmount();
    renderForm(createWaitlistHook({ waitlist: { id: "wait_123" } }));
    expect(screen.getByRole("heading", { name: "You’re on the waitlist" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to the forum" })).toHaveAttribute("href", "/");
  });
});
