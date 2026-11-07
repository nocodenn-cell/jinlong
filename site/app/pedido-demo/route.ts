import { handleDemoRequest, supabaseDemoStore } from '@/lib/demoRequest'
import { clientIpFrom } from '@/lib/pedidoDemoGuards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Limite de taxa e idempotência ficam no banco (função registrar_lead_comercial), compartilhados por todas as instâncias. */
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
  const res = await handleDemoRequest(input, { store: supabaseDemoStore(), clientIp: clientIpFrom(request.headers) })
  return Response.json(res.body, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
}
