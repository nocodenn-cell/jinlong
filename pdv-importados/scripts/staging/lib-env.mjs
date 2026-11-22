/**
 * Helpers compartilhados dos scripts staging/capacity (STG-01).
 * Não carrega nem altera pdv-importados/.env.local.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const {
  assertCapacityTargetFromEnv,
} = require(join(__dirname, '../../../scripts/capacity-target-guard.cjs'))

export const CAPACITY_EMAIL_DOMAIN = 'capacity.staging.invalid'
export const CAPACITY_LOJA_PREFIX = 'CAP_L'
export const CAPACITY_SKU_LAST_UNIT = 'CAP_LAST_UNIT'

/** UUID determinístico loja N (1..50): c0a7eeee-00NN-4000-8000-0000000000NN */
export function lojaIdForIndex(n) {
  const nn = String(n).padStart(2, '0')
  return `c0a7eeee-00${nn}-4000-8000-0000000000${nn}`
}

export function lojaCodigo(n) {
  return `${CAPACITY_LOJA_PREFIX}${String(n).padStart(2, '0')}`
}

export function operadorEmail(lojaN, caixaN) {
  return `op.l${String(lojaN).padStart(2, '0')}.c${String(caixaN).padStart(2, '0')}@${CAPACITY_EMAIL_DOMAIN}`
}

export function gerenteEmail(lojaN) {
  return `gerente.l${String(lojaN).padStart(2, '0')}@${CAPACITY_EMAIL_DOMAIN}`
}

export function produtoCodigo(lojaN, skuN = 1) {
  // 13 dígitos sintéticos (não GTIN real de cliente)
  return `990${String(lojaN).padStart(2, '0')}${String(skuN).padStart(8, '0')}`
}

export function assertStagingEnv() {
  assertCapacityTargetFromEnv(process.env)
  const url =
    process.env.CAPACITY_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''
  const serviceKey =
    process.env.CAPACITY_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  const anonKey =
    process.env.CAPACITY_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ''
  const password = process.env.CAPACITY_SEED_PASSWORD?.trim() || ''
  if (!url || !serviceKey) {
    throw new Error('Defina CAPACITY_SUPABASE_URL + CAPACITY_SERVICE_ROLE_KEY (ou SUPABASE_*)')
  }
  if (!password || password.length < 12) {
    throw new Error('CAPACITY_SEED_PASSWORD obrigatório (≥12 chars) para seeds staging')
  }
  return { url, serviceKey, anonKey, password }
}
