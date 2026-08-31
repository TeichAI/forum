import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PollSnapshot } from "@/lib/polls";

const mocks = vi.hoisted(() => ({ vote: vi.fn() }));
vi.mock("@/actions/forum", () => ({ voteInPoll: mocks.vote }));

import { PollCard } from "./poll-card";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Set<() => void>>();
  close = vi.fn();
  constructor(readonly url: string) { MockEventSource.instances.push(this); }
  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string) { for (const listener of this.listeners.get(type) ?? []) listener(); }
}

const poll: PollSnapshot = {
  id: "poll", question: "Which choice?", expiresAt: "2099-09-01T00:00:00.000Z", status: "ACTIVE",
  totalVotes: 3, selectedOptionId: "first",
  options: [
    { id: "first", text: "First", position: 0, voteCount: 1, percentage: 33 },
    { id: "second", text: "Second", position: 1, voteCount: 2, percentage: 67 },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  MockEventSource.instances.length = 0;
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal("fetch", vi.fn());
  mocks.vote.mockResolvedValue({ status: "success", message: "Vote recorded.", poll });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PollCard", () => {
  it("renders compact, accessible live results with one-click controls", async () => {
    const { container } = render(<PollCard initialPoll={poll} canVote />);
    expect(screen.getByRole("heading", { name: "Which choice?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Poll active")).toHaveTextContent("Live");
    expect(screen.getByRole("radiogroup", { name: "Poll choices" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /First/ })).toBeChecked();
    expect(screen.getByText("Your vote")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Second: 67%" })).toHaveAttribute("aria-valuenow", "67");
    expect(screen.queryByRole("button", { name: /vote/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("submits a changed row exactly once, blocks concurrent changes, and reconciles the action snapshot", async () => {
    const user = userEvent.setup();
    const pending = deferred<Awaited<ReturnType<typeof mocks.vote>>>();
    const changed = {
      ...poll, selectedOptionId: "second",
      options: [{ ...poll.options[0]!, voteCount: 0, percentage: 0 }, { ...poll.options[1]!, voteCount: 3, percentage: 100 }],
    };
    mocks.vote.mockReturnValueOnce(pending.promise);
    render(<PollCard initialPoll={poll} canVote />);
    await user.click(screen.getByRole("radio", { name: /Second/ }));
    expect(mocks.vote).toHaveBeenCalledOnce();
    expect(screen.getByText("Saving vote…")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /First/ })).toBeDisabled();
    fireEvent.click(screen.getByText("First"));
    expect(mocks.vote).toHaveBeenCalledOnce();
    pending.resolve({ status: "success", message: "Vote recorded.", poll: changed });
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Second: 100%" })).toBeInTheDocument());
    expect(screen.getByText("Vote recorded.")).toHaveAttribute("role", "status");
    expect(screen.getByRole("radio", { name: /Second/ })).toBeChecked();
  });

  it("rolls an optimistic selection back on failures and presents errors accessibly", async () => {
    const user = userEvent.setup();
    mocks.vote.mockResolvedValueOnce({ status: "error", message: "Could not save." });
    render(<PollCard initialPoll={poll} canVote />);
    await user.click(screen.getByRole("radio", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save."));
    expect(screen.getByRole("radio", { name: /First/ })).toBeChecked();
    mocks.vote.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("radio", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("couldn’t record"));
    expect(screen.getByRole("radio", { name: /First/ })).toBeChecked();
  });

  it("rolls back rate-limited changes and starts a restrained retry cooldown", async () => {
    const user = userEvent.setup();
    mocks.vote.mockResolvedValueOnce({ status: "rate_limited", message: "Please slow down." });
    render(<PollCard initialPoll={poll} canVote />);
    await user.click(screen.getByRole("radio", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Please slow down."));
    expect(screen.getByRole("radio", { name: /First/ })).toBeChecked();
    expect(screen.getByText(/Try again in 30 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).not.toHaveAttribute("aria-busy");
  });

  it("renders anonymous, closed, and zero-vote polls as read-only result rows", () => {
    const { unmount } = render(<PollCard initialPoll={{ ...poll, totalVotes: 0, selectedOptionId: null, options: poll.options.map((option) => ({ ...option, voteCount: 0, percentage: 0 })) }} canVote={false} />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getAllByRole("progressbar").every((bar) => bar.getAttribute("aria-valuenow") === "0")).toBe(true);
    unmount();
    render(<PollCard initialPoll={{ ...poll, status: "CLOSED" }} canVote />);
    expect(screen.getByLabelText("Poll closed")).toHaveTextContent("Closed");
    expect(screen.getByText(/Final results/)).toHaveTextContent("3 votes");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("reconciles on stream connection and coalesces overlapping refresh signals", async () => {
    const first = deferred<Response>();
    const refreshed = { ...poll, totalVotes: 4, options: poll.options.map((option, index) => ({ ...option, voteCount: index ? 3 : 1, percentage: index ? 75 : 25 })) };
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockResolvedValue({ ok: true, json: async () => refreshed } as Response);
    render(<PollCard initialPoll={poll} canVote />);
    const stream = MockEventSource.instances[0]!;
    act(() => stream.onopen?.());
    act(() => { stream.emit("refresh"); stream.emit("refresh"); });
    expect(fetch).toHaveBeenCalledOnce();
    first.resolve({ ok: true, json: async () => poll } as Response);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Second: 75%" })).toBeInTheDocument());
  });

  it("refreshes on recovery, falls back slowly while disconnected, and cleans up", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => poll } as Response);
    const { unmount } = render(<PollCard initialPoll={poll} canVote />);
    const stream = MockEventSource.instances[0]!;
    act(() => stream.onerror?.());
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
    expect(stream.close).toHaveBeenCalledOnce();
  });

  it("closes locally at expiration while preserving the latest results", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    render(<PollCard initialPoll={{ ...poll, expiresAt: "2026-08-30T12:00:01.000Z" }} canVote />);
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByLabelText("Poll closed")).toBeInTheDocument();
    expect(screen.getByText(/Final results/)).toHaveTextContent("3 votes");
  });
});
