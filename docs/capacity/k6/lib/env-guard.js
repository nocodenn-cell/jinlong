/**
 * Abort k6 if the target looks like production.
 * STG-01: staging exige allowlist positiva + denylist de refs via env
 * (project refs de produção não são versionados).
 */

const PROD_HOST_FRAGMENTS = [
  'jinlong.app',
  'pdv-importados.vercel.app',
  'production',
  'prod-',
  '-prod.',
]

export function assertSafeCapacityTarget() {
  const env = (__ENV.CAPACITY_ENV || '').toLowerCase()
  const url = (__ENV.K6_SUPABASE_URL || '').toLowerCase()
  const allowed = (
    __ENV.CAPACITY_ALLOWED_PROJECT_REF ||
    __ENV.GATE_STAGING_PROJECT_REF ||
    ''
  ).toLowerCase()
  const blocked = (__ENV.CAPACITY_BLOCKED_PROJECT_REFS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  if (!url) {
    throw new Error('K6_SUPABASE_URL ausente — recusando execução')
  }

  if (env !== 'staging' && env !== 'local') {
    throw new Error(
      `CAPACITY_ENV="${env}" inválido. Use staging|local. Produção proibida.`,
    )
  }

  for (const frag of PROD_HOST_FRAGMENTS) {
    if (url.includes(frag)) {
      throw new Error(`Alvo bloqueado: URL contém "${frag}"`)
    }
  }

  for (const ref of blocked) {
    if (url.includes(ref)) {
      throw new Error('Alvo bloqueado: project ref consta em CAPACITY_BLOCKED_PROJECT_REFS')
    }
    if (allowed === ref) {
      throw new Error('CAPACITY_ALLOWED_PROJECT_REF aponta para ref bloqueado')
    }
  }

  if (env === 'local') {
    if (!/localhost|127\.0\.0\.1/.test(url)) {
      throw new Error('CAPACITY_ENV=local exige URL localhost')
    }
    return
  }

  if (blocked.length === 0) {
    throw new Error(
      'CAPACITY_BLOCKED_PROJECT_REFS obrigatório em staging (ref de produção, não versionado)',
    )
  }

  if (!/^[a-z0-9]{20}$/.test(allowed)) {
    throw new Error(
      'CAPACITY_ALLOWED_PROJECT_REF (20 chars) obrigatório para CAPACITY_ENV=staging',
    )
  }

  const m = url.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/)
  if (!m) {
    throw new Error('K6_SUPABASE_URL deve ser https://<ref>.supabase.co')
  }
  if (m[1] !== allowed) {
    throw new Error(
      `ref da URL (${m[1]}) ≠ CAPACITY_ALLOWED_PROJECT_REF (${allowed})`,
    )
  }
}
