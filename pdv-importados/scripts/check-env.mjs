#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env.local')

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]

const recommended = [
  'NEXT_PUBLIC_ADMIN_CHINESE_UI',
  'RELATORIO_TIMEZONE',
  'USE_UNIFIED_SALES_FLOW',
  'STRICT_MANAGER_DISCOUNT_AUTH',
]

function parseEnv(content) {
  const out = new Map()
  for (const lineRaw of content.split(/\r?\n/)) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    out.set(key, val)
  }
  return out
}

if (!fs.existsSync(envPath)) {
  console.error(`[env-check] Arquivo não encontrado: ${envPath}`)
  console.error('[env-check] Copie .env.example para .env.local e preencha os valores.')
  process.exit(1)
}

const parsed = parseEnv(fs.readFileSync(envPath, 'utf8'))
const missing = required.filter((k) => !parsed.get(k))
if (missing.length > 0) {
  console.error('[env-check] Variáveis obrigatórias ausentes:')
  for (const k of missing) console.error(` - ${k}`)
  process.exit(1)
}

const missingRecommended = recommended.filter((k) => !parsed.get(k))
if (missingRecommended.length > 0) {
  console.warn('[env-check] Aviso: variáveis recomendadas ausentes:')
  for (const k of missingRecommended) console.warn(` - ${k}`)
}

console.log('[env-check] OK: variáveis obrigatórias do pdv-importados presentes.')
