/**
 * Abort k6 if the target looks like production.
 * Used by every capacity scenario (FASE 2 skeleton).
 */

const DEFAULT_BLOCKED = [
  'jinlong.app',
  'production',
  'prod-',
  '-prod.',
]

export function assertSafeCapacityTarget() {
  const env = (__ENV.CAPACITY_ENV || '').toLowerCase()
  const url = (__ENV.K6_SUPABASE_URL || '').toLowerCase()

  if (!url) {
    throw new Error('K6_SUPABASE_URL ausente — recusando execução')
  }

  if (env !== 'staging' && env !== 'local') {
    throw new Error(
      `CAPACITY_ENV="${env}" inválido. Use staging|local. Produção proibida.`,
    )
  }

  if (env === 'local' && !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('CAPACITY_ENV=local exige URL localhost')
  }

  const extra = (__ENV.K6_BLOCKED_URL_FRAGMENTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  for (const frag of [...DEFAULT_BLOCKED, ...extra]) {
    if (url.includes(frag)) {
      throw new Error(
        `Alvo bloqueado: URL contém "${frag}". Capacidade só em staging/local.`,
      )
    }
  }

  const allowedRef = (__ENV.GATE_STAGING_PROJECT_REF || '').toLowerCase()
  if (env === 'staging' && allowedRef && !url.includes(allowedRef)) {
    throw new Error(
      `K6_SUPABASE_URL não contém GATE_STAGING_PROJECT_REF=${allowedRef}`,
    )
  }
}
