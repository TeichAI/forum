import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poll: vi.fn(), vote: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  poll: { findUnique: mocks.poll },
  pollVote: { findUnique: mocks.vote },
} }));

import { getPollSnapshot } from "./poll-data";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poll.mockResolvedValue({
    id: "poll", question: "Pick one", expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    options: [
      { id: "first", text: "First", position: 0, _count: { votes: 1 } },
      { id: "second", text: "Second", position: 1, _count: { votes: 2 } },
    ],
  });
  mocks.vote.mockResolvedValue({ optionId: "second" });
});

describe("getPollSnapshot", () => {
  it("returns ordered viewer-aware totals and rounded percentages", async () => {
    await expect(getPollSnapshot("poll", "viewer", undefined, new Date("2026-08-31T00:00:00.000Z"))).resolves.toEqual({
      id: "poll", question: "Pick one", expiresAt: "2026-09-01T00:00:00.000Z", status: "ACTIVE",
      totalVotes: 3, selectedOptionId: "second",
      options: [
        { id: "first", text: "First", position: 0, voteCount: 1, percentage: 33 },
        { id: "second", text: "Second", position: 1, voteCount: 2, percentage: 67 },
      ],
    });
    expect(mocks.poll).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "poll" }, select: expect.objectContaining({ options: expect.objectContaining({ orderBy: { position: "asc" } }) }),
    }));
  });

  it("supports anonymous zero-vote and missing polls", async () => {
    mocks.poll.mockResolvedValueOnce({
      id: "poll", question: "Empty", expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      options: [{ id: "first", text: "First", position: 0, _count: { votes: 0 } }],
    });
    const snapshot = await getPollSnapshot("poll", undefined, undefined, new Date("2026-08-02T00:00:00.000Z"));
    expect(snapshot).toEqual(expect.objectContaining({ status: "CLOSED", totalVotes: 0, selectedOptionId: null }));
    expect(snapshot?.options[0]?.percentage).toBe(0);
    expect(mocks.vote).not.toHaveBeenCalled();
    mocks.poll.mockResolvedValueOnce(null);
    await expect(getPollSnapshot("missing")).resolves.toBeNull();
  });
});
