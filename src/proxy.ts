import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isE2ETestMode } from "@/lib/e2e-auth";
import { consumeRateLimit, RATE_LIMIT_POLICIES, railwayClientIp } from "@/lib/rate-limit";

function isLimitedRead(request: NextRequest) {
  return request.method === "GET" && request.nextUrl.pathname !== "/rate-limited";
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
});

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isE2ETestMode()) return NextResponse.next();
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
