import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const endpoint = process.env.FISCAL_WORKER_ENDPOINT
  const key = process.env.FISCAL_WORKER_KEY
  if (!endpoint || !key) {
    return NextResponse.json(
      { ok: false, error: "FISCAL_WORKER_ENDPOINT/FISCAL_WORKER_KEY not configured" },
      { status: 500 },
    )
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FISCAL-WORKER-KEY": key,
    },
    body: JSON.stringify({ limit: 20 }),
  })

  const payload = await res.json().catch(() => ({}))
  return NextResponse.json(payload, { status: res.status })
}
