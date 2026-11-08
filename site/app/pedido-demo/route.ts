import { handleDemoRequest, supabaseDemoStore } from '@/lib/demoRequest'
import { clientIpFrom, ehJson, linhaDeLog, origemPermitida, origensPermitidas, type EventoLog } from '@/lib/pedidoDemoGuards'
import { getSiteUrl } from '@/lib/siteUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const EVENTO_POR_STATUS: Record<number, EventoLog> = { 201: 'gravado', 400: 'rejeitado', 409: 'rejeitado', 429: 'limite', 503: 'indisponivel' }

/** Toda saída do POST passa por aqui: registra a tentativa (sem dado pessoal) e responde com o corpo de erro padrão. */
function recusar(evento: EventoLog, status: number, motivo: string): Response {
  console.log(linhaDeLog(evento, status, motivo))
  return Response.json({ ok: false, error: 'invalid', fields: [] }, { status, headers: NO_STORE })
}

/** Limite de taxa e idempotência ficam no banco (função registrar_lead_comercial), compartilhados por todas as instâncias. */
export async function POST(request: Request): Promise<Response> {
  const permitidas = origensPermitidas(getSiteUrl(), process.env.SITE_DEMO_EXTRA_ORIGINS)
  if (!origemPermitida(request.headers.get('origin'), permitidas)) return recusar('rejeitado', 403, 'ORIGEM')
  const length = Number(request.headers.get('content-length') ?? '0')
  if (!ehJson(request.headers.get('content-type')) || length > 4096) return recusar('rejeitado', 400, 'CABECALHO')
  let input: unknown = null
  try {
    input = await request.json()
  } catch {
    return recusar('rejeitado', 400, 'JSON')
  }
  const res = await handleDemoRequest(input, { store: supabaseDemoStore(), clientIp: clientIpFrom(request.headers) })
  // Honeypot preenchido: handleDemoRequest responde 201 sem gravar; o log marca como honeypot, não como gravado.
  const website = (input as { website?: unknown } | null)?.website
  const honeypot = typeof website === 'string' && website.trim() !== ''
  const evento: EventoLog = honeypot && res.status === 201 ? 'honeypot' : (EVENTO_POR_STATUS[res.status] ?? 'indisponivel')
  const motivo = 'error' in res.body ? res.body.error.toUpperCase() : undefined
  console.log(linhaDeLog(evento, res.status, motivo))
  return Response.json(res.body, { status: res.status, headers: NO_STORE })
}
