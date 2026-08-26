import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isE2ETestMode } from "@/lib/e2e-auth";
import { consumeRateLimit, RATE_LIMIT_POLICIES, railwayClientIp } from "@/lib/rate-limit";

function isLimitedRead(request: NextRequest) {
  return request.method === "GET" && !["/rate-limited", "/healthz", "/readyz"].includes(request.nextUrl.pathname);
}

function isHealthCheck(request: NextRequest) {
  return request.nextUrl.pathname === "/healthz" || request.nextUrl.pathname === "/readyz";
}

function limitedResponse(request: NextRequest, retryAfterSeconds: number, resetAt: string) {
  const destination = new URL("/rate-limited", request.url);
  destination.searchParams.set("retryAfter", String(retryAfterSeconds));
  destination.searchParams.set("resetAt", resetAt);
  const response = NextResponse.rewrite(destination, { status: 429 });
  response.headers.set("Retry-After", String(retryAfterSeconds));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

const clerkProxy = clerkMiddleware(async (authResult, request) => {
  if (!isLimitedRead(request)) return NextResponse.next();
  const { userId } = await authResult();
  const ip = railwayClientIp(request.headers);
  if (!userId && !ip) return NextResponse.next();
  const authenticated = Boolean(userId);
  const policies = [authenticated ? RATE_LIMIT_POLICIES.readUser : RATE_LIMIT_POLICIES.readAnonymous];
  if (request.nextUrl.pathname === "/search") {
    policies.push(authenticated ? RATE_LIMIT_POLICIES.searchUser : RATE_LIMIT_POLICIES.searchAnonymous);
  }
  const result = await consumeRateLimit(
    authenticated ? { kind: "user", value: userId! } : { kind: "ip", value: ip! },
    policies,
  );
  return result.allowed ? NextResponse.next() : limitedResponse(request, result.retryAfterSeconds, result.resetAt);
}, {
  contentSecurityPolicy: {
    strict: true,
    reportTo: "/api/csp-report",
    directives: {
      "connect-src": ["https://*.uploadthing.com", "https://utfs.io", "https://*.ufs.sh"],
      "img-src": ["data:", "blob:", "https://utfs.io", "https://*.ufs.sh"],
      "object-src": ["none"],
      "frame-ancestors": ["none"],
      "report-uri": ["/api/csp-report"],
    },
  },
});

function removeUnsafeInlineScripts(value: string) {
  return value.split(";").map((directive) => {
    const trimmed = directive.trim();
    return trimmed.startsWith("script-src ")
      ? trimmed.split(/\s+/).filter((token) => token !== "'unsafe-inline'").join(" ")
      : trimmed;
  }).filter(Boolean).join("; ");
}

function enforceStrictScriptPolicy(response: Response) {
  for (const name of ["content-security-policy", "x-middleware-request-content-security-policy"]) {
    const policy = response.headers.get(name);
    if (policy) response.headers.set(name, removeUnsafeInlineScripts(policy));
  }
  return response;
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isE2ETestMode() || isHealthCheck(request)) return NextResponse.next();
  const response = await clerkProxy(request, event);
  return response ? enforceStrictScriptPolicy(response) : response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk(.*)",
  ],
};
