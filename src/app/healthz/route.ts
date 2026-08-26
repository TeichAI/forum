const NO_STORE = { "Cache-Control": "no-store" };

export function GET() {
  return Response.json({ status: "ok" }, { headers: NO_STORE });
}
