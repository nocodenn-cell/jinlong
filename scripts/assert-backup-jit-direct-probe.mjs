#!/usr/bin/env node
/**
 * Gate estático: sonda DIRETA Temporary Access antes do pooler, redação literal
 * do PAT e diagnóstico IPv6 no log. Sem rede, sem secrets, sem Postgres.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const WORKFLOW_REQUIRED = [
  { label: 'sonda host direto db.<ref>.supabase.co', re: /direct_host="db\.\$\{SUPABASE_PROJECT_REF\}\.supabase\.co"/ },
  { label: 'URI direta user=postgres (sem .ref) + sslmode=require', re: /postgres:\/\/postgres:\$\{JIT_PAT_ENC\}@\$\{direct_host\}:5432\/postgres\?sslmode=require/ },
  { label: 'modo direct registrado no output', re: /mode="direct"/ },
  { label: 'fallback pooler com jit=true', re: /options=-c%20jit%3dtrue/ },
  { label: 'step id discover-db', re: /id:\s*discover-db/ },
  { label: 'dump ramifica por CONN_MODE', re: /CONN_MODE:\s*\$\{\{\s*steps\.discover-db\.outputs\.conn_mode\s*\}\}/ },
  { label: 'mensagem de erro aponta Temporary Access (nao senha permanente)', re: /Temporary Access\/JIT recusado/ },
  { label: 'classificador da sonda direta', re: /node scripts\/backup-jit-direct-failure\.mjs/ },
  { label: 'contagem DNS antes da sonda', re: /--print-dns/ },
  { label: 'rota IPv6 passada ao classificador', re: /--ipv6-route/ },
  { label: 'redacao literal tambem no pooler', re: /--redact-only/ },
  { label: 'checagem de rota IPv6 default no runner', re: /ip -6 route show default/ },
  { label: 'checkout para o script de diagnostico', re: /uses:\s*actions\/checkout@/ },
]

export const HELPER_REQUIRED = [
  { label: 'motivo sem_aaaa', re: /sem_aaaa/ },
  { label: 'motivo sem_rota_ipv6', re: /sem_rota_ipv6/ },
  { label: 'motivo autenticacao', re: /autenticacao/ },
  { label: 'motivo timeout', re: /timeout/ },
  { label: 'substituicao literal do segredo', re: /\.split\(secret\)\.join\('\*\*\*'\)/ },
  { label: 'linha de log direct: motivo=', re: /direct: motivo=\$\{result\.motivo\}/ },
]

export const WORKFLOW_FORBIDDEN = [
  { label: 'sed interpolando JIT_PAT', re: /sed[^\n]*\$\{?JIT_PAT/ },
]

export const PATH_MARKERS = [
  "'.github/workflows/backup-scheduled.yml'",
  "'scripts/assert-backup-jit-direct-probe.mjs'",
  "'scripts/backup-jit-direct-failure.mjs'",
]

export function findMissing(src, rules) {
  return rules.filter((item) => !item.re.test(src)).map((item) => item.label)
}

export function findForbidden(src, rules) {
  return rules.filter((item) => item.re.test(src)).map((item) => item.label)
}

export function scriptCallCount(workflowSrc) {
  return workflowSrc.split('backup-jit-direct-failure.mjs').length - 1
}

export function missingPathMarkers(ciSrc, fallbackSrc) {
  const missing = []
  for (const marker of PATH_MARKERS) {
    if (!ciSrc.includes(marker)) missing.push(`ci-pdv-importados.yml sem ${marker}`)
    if (!fallbackSrc.includes(marker)) missing.push(`required-checks-fallback.yml sem ${marker}`)
  }
  return missing
}

export function evaluateBackupJitProbe(workflowSrc, helperSrc) {
  const missing = [
    ...findMissing(workflowSrc, WORKFLOW_REQUIRED),
    ...findMissing(helperSrc, HELPER_REQUIRED),
  ]
  const forbidden = findForbidden(workflowSrc, WORKFLOW_FORBIDDEN)
  const calls = scriptCallCount(workflowSrc)
  if (calls < 2) missing.push('script de diagnostico chamado menos de 2 vezes (direto e pooler)')
  return { missing, forbidden, calls }
}

function readRepo(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function report(title, items) {
  if (items.length === 0) return
  console.error(title)
  for (const item of items) console.error(`  - ${item}`)
}

function main() {
  const workflowSrc = readRepo('.github/workflows/backup-scheduled.yml')
  const helperSrc = readRepo('scripts/backup-jit-direct-failure.mjs')
  const ciSrc = readRepo('.github/workflows/ci-pdv-importados.yml')
  const fallbackSrc = readRepo('.github/workflows/required-checks-fallback.yml')
  const probe = evaluateBackupJitProbe(workflowSrc, helperSrc)
  const paths = missingPathMarkers(ciSrc, fallbackSrc)
  const failed = probe.missing.length + probe.forbidden.length + paths.length > 0
  if (failed) {
    console.error('assert-backup-jit-direct-probe: FAIL')
    report('ausente:', probe.missing)
    report('proibido:', probe.forbidden)
    report('paths:', paths)
    process.exit(1)
  }
  const checks = WORKFLOW_REQUIRED.length + HELPER_REQUIRED.length + PATH_MARKERS.length
  console.log('assert-backup-jit-direct-probe: PASS')
  console.log(`  checks=${checks} calls=${probe.calls}`)
}

function invokedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href
  } catch {
    return false
  }
}

if (invokedDirectly()) main()
