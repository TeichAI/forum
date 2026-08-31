import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(), poll: vi.fn(), access: vi.fn(), consume: vi.fn(), subscribe: vi.fn(), listener: null as null | (() => void), unsubscribe: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer }));
vi.mock("@/lib/db", () => ({ db: { poll: { findUnique: mocks.poll } } }));
vi.mock("@/lib/poll-access", () => ({ canAccessPollThread: mocks.access }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeRateLimit: mocks.consume };
});
vi.mock("@/lib/poll-events", () => ({ subscribeToPoll: mocks.subscribe }));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "poll" }) };
function request(signal?: AbortSignal, headers?: Record<string, string>) {
  return { signal: signal ?? new AbortController().signal, headers: new Headers(headers) } as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listener = null;
  mocks.viewer.mockResolvedValue(null);
  mocks.poll.mockResolvedValue({ thread: {} });
  mocks.access.mockResolvedValue(true);
  mocks.consume.mockResolvedValue({ outcome: "allowed", allowed: true, retryAfterSeconds: 0, remaining: 3 });
  mocks.subscribe.mockImplementation(async (_id: string, listener: () => void) => { mocks.listener = listener; return mocks.unsubscribe; });
});

afterEach(() => vi.useRealTimers());

describe("GET /api/polls/[id]/events", () => {
  it("opens an authorized SSE stream, signals refreshes, heartbeats, and cleans up on abort", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const response = await GET(request(abort.signal, { "x-real-ip": "203.0.113.9" }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(mocks.consume).toHaveBeenCalledWith({ kind: "ip", value: "203.0.113.9" }, [expect.objectContaining({ scope: "stream:poll:anonymous" })], { storageFailure: "deny" });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: connected");
    mocks.listener?.();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: refresh");
    vi.advanceTimersByTime(20_000);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("heartbeat");
    abort.abort();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("uses authenticated stream limits and returns explicit authorization and limit failures", async () => {
    mocks.viewer.mockResolvedValue({ id: "viewer", clerkId: "clerk", role: "MEMBER" });
    const abort = new AbortController();
    const success = await GET(request(abort.signal), context);
    expect(mocks.consume).toHaveBeenCalledWith({ kind: "user", value: "clerk" }, [expect.objectContaining({ scope: "stream:poll:user" })], { storageFailure: "deny" });
    abort.abort();
    await success.body?.cancel();

    mocks.access.mockResolvedValueOnce(false);
    expect((await GET(new Request("http://local"), context)).status).toBe(404);
    mocks.poll.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://local"), context)).status).toBe(404);

    mocks.consume.mockResolvedValueOnce({ outcome: "limit_exceeded", allowed: false, retryAfterSeconds: 17, remaining: 0 });
    const limited = await GET(new Request("http://local"), context);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("17");
    mocks.consume.mockResolvedValueOnce({ outcome: "storage_unavailable", allowed: false, retryAfterSeconds: 30, remaining: 0 });
    expect((await GET(new Request("http://local"), context)).status).toBe(503);
  });

  it("returns 503 when the PostgreSQL listener cannot subscribe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.subscribe.mockRejectedValueOnce(new Error("private detail"));
    const response = await GET(new Request("http://local"), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Streaming is temporarily unavailable" });
  });
});
