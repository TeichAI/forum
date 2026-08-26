import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { $queryRaw: query } }));

import { GET as liveness } from "./healthz/route";
import { GET as readiness } from "./readyz/route";

beforeEach(() => vi.clearAllMocks());

describe("health routes", () => {
  it("answers liveness without accessing the database", async () => {
    const response = liveness();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(query).not.toHaveBeenCalled();
  });

  it("reports database readiness without leaking query failures", async () => {
    query.mockResolvedValueOnce([{ ok: 1 }]);
    const ready = await readiness();
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({ status: "ok" });

    query.mockRejectedValueOnce(new Error("postgresql://secret-host/private"));
    const unavailable = await readiness();
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ status: "unavailable" });
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
  });
});
