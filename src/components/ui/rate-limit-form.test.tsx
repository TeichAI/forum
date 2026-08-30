import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitForm } from "./rate-limit-form";
import { SubmitButton } from "./submit-button";

beforeEach(() => {
  vi.useRealTimers();
});

describe("RateLimitForm", () => {
  it("preserves input, announces a countdown, and re-enables submission", async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => ({
      status: "rate_limited" as const,
      message: "Please slow down.",
    }));
    render(
      <RateLimitForm action={action}>
        <textarea name="body" defaultValue="Carefully written draft" />
        <SubmitButton>Post</SubmitButton>
      </RateLimitForm>,
    );

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Post" }).closest("form")!);
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Please slow down.");
    expect(screen.getByDisplayValue("Carefully written draft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    expect(screen.getByText("Try again in 30 seconds.")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_100);
    });
    expect(screen.getByText("You can try again now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
  });
});
