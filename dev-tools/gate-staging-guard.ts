import { loadPdvEnv } from './load-env.js'

const DEFAULT_BLOCKED_FRAGMENTS = ['production', 'prod-', '-prod.']

/**
 * hybrid_mode só roda em staging — nunca produção.
 * Override explícito: GATE_ALLOW_HYBRID_ANYWHERE=true (apenas dev local).
 */
export function assertHybridStagingOnly(): void {
  loadPdvEnv()

  if (process.env.GATE_ALLOW_HYBRID_ANYWHERE?.trim() === 'true') {
    console.warn('[gate] GATE_ALLOW_HYBRID_ANYWHERE=true — guard staging desativado')
    return
  }

  const url = (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''
  ).toLowerCase()

  if (!url) {
    throw new Error('hybrid_mode bloqueado: SUPABASE_URL ausente')
  }

  const gateEnv = process.env.GATE_ENV?.trim().toLowerCase()
  const explicitStaging = gateEnv === 'staging' || gateEnv === 'preview'
  const localDev = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url)
  const stagingHint = /staging|stg-|preview|dev-/.test(url)

  const blockedExtra = (process.env.GATE_BLOCKED_URL_FRAGMENTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const blocked = [...DEFAULT_BLOCKED_FRAGMENTS, ...blockedExtra]
  for (const frag of blocked) {
    if (url.includes(frag) && !explicitStaging) {
      throw new Error(
        `hybrid_mode bloqueado: URL contém "${frag}". Defina GATE_ENV=staging ou use ambiente de staging.`,
      )
    }
  }

  const allowedRef = process.env.GATE_STAGING_PROJECT_REF?.trim().toLowerCase()
  if (allowedRef && !url.includes(allowedRef)) {
    throw new Error(
      `hybrid_mode bloqueado: SUPABASE_URL não corresponde a GATE_STAGING_PROJECT_REF=${allowedRef}`,
    )
  }

  if (!explicitStaging && !localDev && !stagingHint) {
    throw new Error(
      'hybrid_mode bloqueado: defina GATE_ENV=staging ou use URL de staging/local.',
    )
  }

  console.log('[gate] hybrid_mode permitido CHAOS_INJECTION=true staging_guard=PASS')
}
