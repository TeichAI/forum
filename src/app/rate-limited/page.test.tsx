import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back }) }));

import RateLimitedPage from "./page";

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("rate-limited page", () => {
  it("starts a fixed local cooldown without accepting query-string timing", () => {
    vi.useFakeTimers();
    render(<RateLimitedPage />);
    expect(screen.getByRole("heading", { name: "A quick breather" })).toBeInTheDocument();
    expect(screen.getByText("Try again in 30 seconds.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
    act(() => vi.advanceTimersByTime(30_100));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.back).toHaveBeenCalled();
  });
});
