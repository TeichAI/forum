const MAX_REPORT_BYTES = 16_384;

function safeDirective(value: unknown) {
  return typeof value === "string" && /^[a-z-]{1,80}$/i.test(value) ? value : "unknown";
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const report = (parsed["csp-report"] ?? parsed.body ?? parsed) as Record<string, unknown>;
    console.warn("CSP violation", {
      directive: safeDirective(report["effective-directive"] ?? report.effectiveDirective),
      disposition: report.disposition === "enforce" ? "enforce" : "report",
    });
  } catch {
    return Response.json({ error: "Invalid report" }, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
