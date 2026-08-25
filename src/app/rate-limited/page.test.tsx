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
  it("renders a safe ready state when opened without trusted reset metadata", async () => {
    render(await RateLimitedPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "A quick breather" })).toBeInTheDocument();
    expect(screen.getByText("You can try again now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("counts down valid proxy metadata before allowing navigation back", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    render(await RateLimitedPage({ searchParams: Promise.resolve({ resetAt: "2026-08-25T12:00:01.000Z" }) }));
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
    act(() => vi.advanceTimersByTime(1_100));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.back).toHaveBeenCalled();
  });
});
