import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ validateRuntimeEnvironment: validate }));

import { register } from "./instrumentation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PHASE", "phase-production-server");
});

afterEach(() => vi.unstubAllEnvs());

describe("server instrumentation", () => {
  it("validates the Node server application environment during startup", async () => {
    await register();
    expect(validate).toHaveBeenCalledOnce();
  });

  it("skips Edge workers and production build workers", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await register();
    expect(validate).not.toHaveBeenCalled();
  });
});
