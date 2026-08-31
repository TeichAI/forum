import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), verifiedRole: vi.fn(), poll: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer, getVerifiedUserRole: mocks.verifiedRole }));
vi.mock("@/lib/db", () => ({ db: { poll: { findUnique: mocks.poll } } }));
vi.mock("@/lib/poll-data", () => ({ getPollSnapshot: mocks.snapshot }));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "poll" }) };
const publicPoll = { thread: { status: "PUBLISHED", author: { status: "ACTIVE" }, category: { archivedAt: null } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue(null);
  mocks.verifiedRole.mockResolvedValue("MODERATOR");
  mocks.poll.mockResolvedValue(publicPoll);
  mocks.snapshot.mockResolvedValue({ id: "poll", status: "ACTIVE" });
});

describe("GET /api/polls/[id]", () => {
  it("returns public results with private no-store caching", async () => {
    const response = await GET(new Request("http://local"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ id: "poll", status: "ACTIVE" });
    expect(mocks.snapshot).toHaveBeenCalledWith("poll", undefined);
  });

  it("includes the active viewer selection", async () => {
    mocks.viewer.mockResolvedValue({ id: "viewer", role: "MEMBER" });
    await GET(new Request("http://local"), context);
    expect(mocks.snapshot).toHaveBeenCalledWith("poll", "viewer");
  });

  it("hides unavailable threads but permits staff review", async () => {
    mocks.poll.mockResolvedValue({ thread: { ...publicPoll.thread, status: "HIDDEN" } });
    expect((await GET(new Request("http://local"), context)).status).toBe(404);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    mocks.viewer.mockResolvedValue({ id: "staff", clerkId: "clerk", role: "MODERATOR" });
    expect((await GET(new Request("http://local"), context)).status).toBe(200);
    expect(mocks.verifiedRole).toHaveBeenCalled();
  });

  it("returns 404 for missing polls and missing snapshots", async () => {
    mocks.poll.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://local"), context)).status).toBe(404);
    mocks.snapshot.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://local"), context)).status).toBe(404);
  });
});
