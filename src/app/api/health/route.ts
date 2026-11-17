import { NextResponse } from "next/server";
import { healthReport } from "@/lib/audit/health";

/**
 * GET /api/health: liveness for Render (render.yaml healthCheckPath) and
 * uptime monitors. Public on purpose: no session, no cookie needed, nothing
 * secret in the answer (lib/audit/health). 200 while the instance can serve,
 * 503 when the onchainos binary is missing or broken.
 */
export async function GET() {
  const report = await healthReport();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
