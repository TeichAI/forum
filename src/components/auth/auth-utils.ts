export function clerkErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (!error || typeof error !== "object") return fallback;
  if ("longMessage" in error && typeof error.longMessage === "string") return error.longMessage;
  if ("message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export function safeRedirect(value?: string | string[]) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/";

  // Browsers and intermediaries may decode a path more than once. Validate each
  // decoded form so encoded slashes, backslashes, and control characters cannot
  // turn a local path into a protocol-relative or otherwise ambiguous URL.
  let decoded = value;
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return "/";
    }
  } catch {
    return "/";
  }

  try {
    const parsed = new URL(value, "https://teich.invalid");
    return parsed.origin === "https://teich.invalid" ? value : "/";
  } catch {
    return "/";
  }
}

export type AuthFormOrigin = "sign-in" | "sign-up";

export function authFormUrl(origin: AuthFormOrigin, redirectUrl: string, continuation = false) {
  const params = new URLSearchParams();
  const destination = safeRedirect(redirectUrl);
  if (destination !== "/") params.set("redirect_url", destination);
  if (continuation) params.set("sso_continuation", "1");
  const query = params.toString();
  return `/${origin}${query ? `?${query}` : ""}`;
}

export function ssoCallbackUrl(origin: AuthFormOrigin, redirectUrl: string) {
  const params = new URLSearchParams({
    origin,
    redirect_url: safeRedirect(redirectUrl),
  });
  return `/sso-callback?${params.toString()}`;
}
