import { timingSafeEqual } from 'node:crypto'

/**
 * Segredo do orquestrador.
 * Preferência: CRON_SECRET (Vercel Cron) → DI_ORCHESTRATOR_SECRET.
 */
export function resolveOrchestratorSecret(): string | null {
  const cron = process.env.CRON_SECRET?.trim()
  if (cron) return cron
  const di = process.env.DI_ORCHESTRATOR_SECRET?.trim()
  if (di) return di
  return null
}

function extractBearer(header: string | null): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m?.[1]?.trim() || null
}

/**
 * Aceita Authorization: Bearer <secret> ou X-DI-Orchestrator-Key.
 */
export function authorizeOrchestratorRequest(headers: Headers): boolean {
  const expected = resolveOrchestratorSecret()
  if (!expected) return false

  const got =
    extractBearer(headers.get('authorization')) ??
    headers.get('x-di-orchestrator-key')?.trim() ??
    null

  if (!got) return false

  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
