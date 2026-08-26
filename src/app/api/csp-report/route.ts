import { BodyTooLargeError, readBoundedBody } from "@/lib/bounded-body";

const MAX_REPORT_BYTES = 16_384;

function safeDirective(value: unknown) {
  return typeof value === "string" && /^[a-z-]{1,80}$/i.test(value) ? value : "unknown";
}

export async function POST(request: Request) {
  let text: string;
  try {
    text = await readBoundedBody(request, MAX_REPORT_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return new Response(null, { status: 413 });
    return Response.json({ error: "Invalid report" }, { status: 400 });
  }
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
