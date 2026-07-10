#!/usr/bin/env node
/**
 * Checklist pré-produção PDV — flags de ambiente (local/CI).
 * Complementa a página Admin «Diagnóstico do Caixa» e verify_p0_producao.sql.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnvLocal() {
  const path = resolve(ROOT, '.env.local')
  if (!existsSync(path)) return new Map<string, string>()
  const map = new Map<string, string>()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    map.set(t.slice(0, i).trim(), t.slice(i + 1).trim())
  }
  return map
}

function envGet(map, key) {
  return process.env[key]?.trim() || map.get(key)?.trim() || ''
}

function parseBool(raw) {
  const n = (raw ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(n)) return true
  if (['false', '0', 'no', 'off'].includes(n)) return false
  return null
}

const envMap = loadEnvLocal()

const checks = []

function add(id, ok, detalhe, aviso = false) {
  checks.push({ id, status: ok ? 'OK' : aviso ? 'AVISO' : 'FALHA', detalhe })
}

add(
  'NEXT_PUBLIC_SUPABASE_URL',
  Boolean(envGet(envMap, 'NEXT_PUBLIC_SUPABASE_URL')),
  'URL do Supabase',
)
add(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  Boolean(envGet(envMap, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')),
  'Chave anon',
)

const strictRaw = envGet(envMap, 'STRICT_MANAGER_DISCOUNT_AUTH')
const strictParsed = parseBool(strictRaw)
add(
  'STRICT_MANAGER_DISCOUNT_AUTH',
  strictParsed !== null || !strictRaw,
  strictParsed === null && strictRaw
    ? `Valor inválido: ${strictRaw}`
    : `Valor: ${strictParsed ?? 'default true'}`,
  false,
)

const unifiedRaw = envGet(envMap, 'USE_UNIFIED_SALES_FLOW')
const unifiedParsed = parseBool(unifiedRaw)
add(
  'USE_UNIFIED_SALES_FLOW',
  unifiedParsed !== false,
  unifiedParsed === false ? 'false — use true em produção' : `Valor: ${unifiedParsed ?? 'não definido'}`,
  unifiedParsed === false,
)

const fiscalOn = parseBool(envGet(envMap, 'AUTO_ENQUEUE_FISCAL_ON_SALE')) === true
const fiscalWorker = Boolean(envGet(envMap, 'FISCAL_WORKER_ENDPOINT')) && Boolean(envGet(envMap, 'FISCAL_WORKER_KEY'))
add(
  'AUTO_ENQUEUE_FISCAL_ON_SALE',
  !fiscalOn || fiscalWorker,
  fiscalOn ? (fiscalWorker ? 'Fiscal com worker OK' : 'true sem worker — aviso piloto') : 'Desligado (OK piloto)',
  fiscalOn && !fiscalWorker,
)

const produto = envGet(envMap, 'PDV_DIAGNOSTICO_PRODUTO_CODIGO') || '7898512340003 (padrão)'
add('PDV_DIAGNOSTICO_PRODUTO_CODIGO', true, `Produto teste: ${produto}`, true)

console.log('\n=== Checklist pré-produção PDV (ambiente) ===\n')
for (const c of checks) {
  console.log(`[${c.status.padEnd(5)}] ${c.id}`)
  console.log(`         ${c.detalhe}`)
}

const falhas = checks.filter((c) => c.status === 'FALHA').length
const avisos = checks.filter((c) => c.status === 'AVISO').length
const veredito = falhas === 0 ? 'PRONTO_PILOTO' : 'BLOQUEADO'

console.log(`\nResumo: ${falhas} falha(s), ${avisos} aviso(s) → ${veredito}`)
console.log(`\nPróximo passo: execute backend/supabase/scripts/verify_p0_producao.sql no Supabase`)
console.log(`               e abra Admin → Diagnóstico do Caixa (/admin/diagnostico-caixa)\n`)

process.exit(falhas > 0 ? 1 : 0)
