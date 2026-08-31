import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pg = vi.hoisted(() => ({ instances: [] as Array<EventEmitter & { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }> }));
vi.mock("pg", () => ({
  Client: class extends EventEmitter {
    connect = vi.fn().mockResolvedValue(undefined);
    query = vi.fn().mockResolvedValue(undefined);
    end = vi.fn().mockResolvedValue(undefined);
    constructor() { super(); pg.instances.push(this); }
  },
}));

import { closePollEventListenerForTests, POLL_EVENT_CHANNEL, subscribeToPoll } from "./poll-events";

beforeEach(() => { pg.instances.length = 0; });
afterEach(() => closePollEventListenerForTests());

describe("PostgreSQL poll event listener", () => {
  it("shares one lazy LISTEN connection and fans out only matching poll signals", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = await subscribeToPoll("poll-a", first);
    await subscribeToPoll("poll-b", second);
    expect(pg.instances).toHaveLength(1);
    expect(pg.instances[0]?.connect).toHaveBeenCalledOnce();
    expect(pg.instances[0]?.query).toHaveBeenCalledWith(`LISTEN ${POLL_EVENT_CHANNEL}`);

    pg.instances[0]?.emit("notification", { channel: POLL_EVENT_CHANNEL, payload: "poll-a" });
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    stopFirst();
    pg.instances[0]?.emit("notification", { channel: POLL_EVENT_CHANNEL, payload: "poll-a" });
    expect(first).toHaveBeenCalledOnce();
  });
});
