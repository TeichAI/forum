import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: vi.fn(),
  auth: vi.fn(async () => ({ userId: null as string | null })),
  consume: vi.fn(),
  clerk: vi.fn(),
  cspOptions: undefined as unknown,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (callback: (auth: typeof mocks.auth, request: unknown) => unknown, options: unknown) => {
    mocks.cspOptions = options;
    return (request: unknown, event: unknown) => mocks.clerk(callback, request, event);
  },
}));
vi.mock("@/lib/e2e-auth", () => ({ isE2ETestMode: mocks.mode }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeRateLimit: mocks.consume };
});
vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => new Response(null, { headers: { "x-next": "1" } })),
    rewrite: vi.fn((url: URL, init?: ResponseInit) => {
      const response = new Response(null, init);
      response.headers.set("x-rewrite", url.toString());
      return response;
    }),
  },
}));

import proxy, { config } from "./proxy";

function request(path = "/", options: { method?: string; ip?: string } = {}) {
  const url = new URL(path, "https://forum.example");
  return {
    method: options.method ?? "GET",
    url: url.toString(),
    nextUrl: url,
    headers: new Headers(options.ip ? { "x-real-ip": options.ip } : undefined),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode.mockReturnValue(false);
  mocks.auth.mockResolvedValue({ userId: null });
  mocks.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, remaining: 10 });
  mocks.clerk.mockImplementation(async (callback, req) => callback(mocks.auth, req));
});

describe("request proxy", () => {
  it("bypasses Clerk and rate limiting only in guarded E2E mode", async () => {
    mocks.mode.mockReturnValue(true);
    const response = await proxy(request(), {} as never);
    if (!response) throw new Error("Expected a proxy response");
    expect(response.headers.get("x-next")).toBe("1");
    expect(mocks.clerk).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("limits anonymous Railway reads by X-Real-IP", async () => {
    await proxy(request("/", { ip: "203.0.113.4" }), {} as never);
    expect(mocks.consume).toHaveBeenCalledWith(
      { kind: "ip", value: "203.0.113.4" },
      [expect.objectContaining({ scope: "read:anonymous" })],
    );
  });

  it("uses the authenticated account and adds the search bucket", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    await proxy(request("/search?q=pond", { ip: "203.0.113.4" }), {} as never);
    expect(mocks.consume).toHaveBeenCalledWith(
      { kind: "user", value: "user_123" },
      [expect.objectContaining({ scope: "read:user" }), expect.objectContaining({ scope: "search:user" })],
    );
  });

  it("does not count mutations, the cooldown page, or anonymous requests without Railway identity", async () => {
    await proxy(request("/", { method: "POST", ip: "203.0.113.4" }), {} as never);
    await proxy(request("/rate-limited", { ip: "203.0.113.4" }), {} as never);
    await proxy(request("/"), {} as never);
    await proxy(request("/healthz", { ip: "203.0.113.4" }), {} as never);
    await proxy(request("/readyz", { ip: "203.0.113.4" }), {} as never);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.clerk).toHaveBeenCalledTimes(3);
  });

  it("rewrites denied reads with 429 retry metadata", async () => {
    mocks.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 17, remaining: 0 });
    const response = await proxy(request("/search", { ip: "203.0.113.4" }), {} as never);
    if (!response) throw new Error("Expected a proxy response");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-rewrite")).toBe("https://forum.example/rate-limited");
    expect(response.headers.get("x-rewrite")).not.toMatch(/retryAfter|resetAt|17/);
  });

  it("matches application and API routes", () => {
    expect(config.matcher).toHaveLength(3);
    expect(config.matcher[1]).toBe("/(api|trpc)(.*)");
    expect(config.matcher[2]).toBe("/__clerk(.*)");
  });

  it("configures Clerk's enforced strict CSP for Clerk and UploadThing", () => {
    expect(mocks.cspOptions).toEqual({
      contentSecurityPolicy: expect.objectContaining({
        strict: true,
        reportTo: "/api/csp-report",
        directives: expect.objectContaining({
          "connect-src": expect.arrayContaining(["https://*.uploadthing.com", "https://*.ufs.sh"]),
          "object-src": ["none"],
          "frame-ancestors": ["none"],
        }),
      }),
    });
  });

  it("removes script unsafe-inline while retaining nonced strict-dynamic policies", async () => {
    mocks.clerk.mockResolvedValueOnce(new Response(null, { headers: {
      "content-security-policy": "script-src 'self' 'unsafe-inline' 'nonce-one' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.uploadthing.com",
      "x-middleware-request-content-security-policy": "script-src 'self' 'unsafe-inline' 'nonce-one' 'strict-dynamic'; style-src 'self' 'unsafe-inline'",
    } }));
    const response = await proxy(request("/", { ip: "203.0.113.4" }), {} as never);
    if (!response) throw new Error("Expected a proxy response");
    const policy = response.headers.get("content-security-policy")!;
    expect(policy).toContain("'nonce-one'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
    expect(policy.match(/style-src[^;]*/)?.[0]).toContain("'unsafe-inline'");
    expect(response.headers.get("x-middleware-request-content-security-policy")?.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
  });
});
