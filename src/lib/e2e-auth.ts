import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const E2E_SESSION_COOKIE = "teich_e2e_session";

export function isE2ETestMode() {
  if (process.env.E2E_TEST_MODE !== "1") return false;
  if (process.env.NODE_ENV === "production") throw new Error("E2E test authentication is unavailable in production");
  if ((process.env.E2E_AUTH_SECRET ?? "").length < 32) throw new Error("E2E_AUTH_SECRET must contain at least 32 characters");
  return true;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createE2ESessionToken(userId: string, expiresAt = Date.now() + 15 * 60_000) {
  if (!isE2ETestMode()) throw new Error("E2E test mode is disabled");
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt }), "utf8").toString("base64url");
  return `${payload}.${signature(payload, process.env.E2E_AUTH_SECRET!)}`;
}

export async function getE2ETestUserId() {
  if (!isE2ETestMode()) return null;
  const token = (await cookies()).get(E2E_SESSION_COOKIE)?.value;
  if (!token) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expected = signature(payload, process.env.E2E_AUTH_SECRET!);
  const supplied = Buffer.from(suppliedSignature);
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: unknown; expiresAt?: unknown };
    if (typeof value.userId !== "string" || typeof value.expiresAt !== "number" || value.expiresAt <= Date.now()) return null;
    return value.userId;
  } catch {
    return null;
  }
}
