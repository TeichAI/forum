import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitForm } from "./rate-limit-form";
import { SubmitButton } from "./submit-button";

beforeEach(() => {
  vi.useRealTimers();
});

describe("RateLimitForm", () => {
  it("preserves input, announces a countdown, and re-enables submission", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    const action = vi.fn(async () => ({
      status: "rate_limited" as const,
      message: "Please slow down.",
      retryAfterSeconds: 2,
      resetAt: "2026-08-25T12:00:02.000Z",
    }));
    render(
      <RateLimitForm action={action}>
        <textarea name="body" defaultValue="Carefully written draft" />
        <SubmitButton>Post</SubmitButton>
      </RateLimitForm>,
    );

    fireEvent.submit(screen.getByRole("button", { name: "Post" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Please slow down."));
    expect(screen.getByDisplayValue("Carefully written draft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    expect(screen.getByText("Try again in 2 seconds.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2_100);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText("You can try again now.")).toBeInTheDocument());
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
  });
});
