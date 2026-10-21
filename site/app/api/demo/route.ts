import { handleDemoRequest, RateLimiter, supabaseDemoStore } from '@/lib/demoRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limiter = new RateLimiter()

export async function POST(request: Request): Promise<Response> {
  const type = request.headers.get('content-type') ?? ''
  const length = Number(request.headers.get('content-length') ?? '0')
  if (!type.includes('application/json') || length > 4096) {
    return Response.json({ ok: false, error: 'invalid', fields: [] }, { status: 400 })
  }
  let input: unknown = null
  try {
    input = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'invalid', fields: [] }, { status: 400 })
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const res = await handleDemoRequest(input, ip, { store: supabaseDemoStore(), limiter })
  return Response.json(res.body, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
}
