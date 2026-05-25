/**
 * Rate limiter in-memory simples para API routes.
 *
 * Sem dependências externas — adequado para instância única (Vercel serverless).
 * Para múltiplas instâncias em escala: migrar para Upstash Redis.
 *
 * Uso:
 *   const result = rateLimit(request, { limit: 20, windowMs: 60_000 })
 *   if (!result.ok) return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
 */

type Entry = { count: number; resetAt: number }

const store = new Map<string, Entry>()

// Limpa entradas expiradas periodicamente (evita memory leak em instâncias longas)
let cleanupScheduled = false
function scheduleCleanup() {
  if (cleanupScheduled) return
  cleanupScheduled = true
  setTimeout(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
    cleanupScheduled = false
  }, 60_000)
}

export type RateLimitOptions = {
  /** Máximo de requests no janela. Padrão: 30 */
  limit?: number
  /** Janela em ms. Padrão: 60s */
  windowMs?: number
  /** Chave personalizada. Padrão: IP do request */
  key?: string
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(
  request: Request,
  options: RateLimitOptions = {},
): RateLimitResult {
  const { limit = 30, windowMs = 60_000 } = options

  const ip =
    options.key ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const now = Date.now()
  const existing = store.get(ip)

  if (!existing || existing.resetAt <= now) {
    const entry: Entry = { count: 1, resetAt: now + windowMs }
    store.set(ip, entry)
    scheduleCleanup()
    return { ok: true, remaining: limit - 1, resetAt: entry.resetAt }
  }

  existing.count += 1
  const remaining = Math.max(0, limit - existing.count)
  return { ok: existing.count <= limit, remaining, resetAt: existing.resetAt }
}
