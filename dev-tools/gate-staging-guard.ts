import { loadPdvEnv } from './load-env.js'
import { assertCapacityTargetFromEnv } from './capacity-target-guard.js'

/**
 * hybrid_mode só roda em staging/local — nunca produção.
 *
 * STG-01: identificação positiva via capacity-target-guard
 * (denylist de prod + CAPACITY_ALLOWED_PROJECT_REF / GATE_STAGING_PROJECT_REF).
 * GATE_ALLOW_HYBRID_ANYWHERE NÃO ignora a denylist de produção.
 */
export function assertHybridStagingOnly(): void {
  loadPdvEnv()

  const url = (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''
  ).toLowerCase()

  if (!url) {
    throw new Error('hybrid_mode bloqueado: SUPABASE_URL ausente')
  }

  if (process.env.GATE_ALLOW_HYBRID_ANYWHERE?.trim() === 'true') {
    console.warn(
      '[gate] GATE_ALLOW_HYBRID_ANYWHERE=true — ainda aplica denylist de produção',
    )
  }

  // Alinha CAPACITY_ENV com GATE_ENV para o guard unificado
  if (!process.env.CAPACITY_ENV && process.env.GATE_ENV) {
    process.env.CAPACITY_ENV = process.env.GATE_ENV
  }
  if (!process.env.CAPACITY_ALLOWED_PROJECT_REF && process.env.GATE_STAGING_PROJECT_REF) {
    process.env.CAPACITY_ALLOWED_PROJECT_REF = process.env.GATE_STAGING_PROJECT_REF
  }

  const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url)
  if (local) {
    process.env.CAPACITY_ENV = process.env.CAPACITY_ENV || 'local'
  } else if (!process.env.CAPACITY_ENV) {
    process.env.CAPACITY_ENV = 'staging'
  }

  assertCapacityTargetFromEnv(process.env)
  console.log('[gate] hybrid_mode permitido CHAOS_INJECTION=true staging_guard=PASS')
}
