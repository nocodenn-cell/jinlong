#!/usr/bin/env node
/**
 * Pipeline de auditoria contínua — roda em sequência: lint, guard:core,
 * stress:pdv, gate:pdv. Reporta APENAS falhas NOVAS: as pré-existentes ficam
 * em scripts/audit-baseline.json e são ignoradas.
 *
 * Uso:
 *   node scripts/continuous-audit.mjs
 *   npm run audit:continuous
 *
 * Saída: exit 0 se nenhuma falha nova; exit 1 se houver ao menos uma.
 * Steps que exigem ambiente vivo (Supabase/seed) são marcados SKIPPED quando a
 * env não está configurada — não contam como falha.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdv = path.join(root, 'pdv-importados')
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'audit-baseline.json'), 'utf8'))

const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', bold: '\x1b[1m',
}
const c = (color, s) => `${C[color]}${s}${C.reset}`

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const results = []
function record(step, status, newIssues = [], detail = '') {
  results.push({ step, status, newIssues, detail })
}

// ── 1) lint ──────────────────────────────────────────────────────────────────
function auditLint() {
  process.stdout.write(c('gray', '• lint … '))
  const r = run('npx', ['eslint', '.', '--ext', '.ts,.tsx', '-f', 'json'], pdv)
  let data
  try {
    data = JSON.parse(r.out.slice(r.out.indexOf('[')))
  } catch {
    console.log(c('yellow', 'não foi possível parsear a saída do eslint'))
    return record('lint', 'ERROR', [], 'saída do eslint ilegível')
  }
  const allowed = new Set(baseline.lint.allowedSignatures)
  const novos = []
  for (const f of data) {
    const rel = f.filePath.replace(`${pdv}/`, '').replaceAll('\\', '/')
    for (const m of f.messages) {
      const sig = `${rel}::${m.ruleId || '?'}::${m.message}`
      if (!allowed.has(sig)) novos.push(`${rel}:${m.line}:${m.column} [${m.ruleId}] ${m.message}`)
    }
  }
  if (novos.length === 0) { console.log(c('green', 'ok (sem regressões)')); return record('lint', 'PASS') }
  console.log(c('red', `${novos.length} problema(s) NOVO(s)`)); record('lint', 'NEW_FAIL', novos)
}

// ── 2) guard:core ────────────────────────────────────────────────────────────
function auditGuardCore() {
  process.stdout.write(c('gray', '• guard:core … '))
  const r = run('node', ['scripts/core-rule-guard.mjs'], root)
  const allowedFiles = baseline.guardCore.allowedFiles
  const novos = []
  for (const line of r.out.split('\n')) {
    const m = line.match(/^\s*-\s+(.+?):\s+(.+)$/)
    if (!m) continue
    const file = m[1]
    if (!allowedFiles.some((a) => file.includes(a))) novos.push(`${file}: ${m[2]}`)
  }
  if (novos.length === 0) { console.log(c('green', 'ok (sem regressões)')); return record('guard:core', 'PASS') }
  console.log(c('red', `${novos.length} violação(ões) NOVA(s)`)); record('guard:core', 'NEW_FAIL', novos)
}

// ── 3) e 4) stress:pdv / gate:pdv (exigem ambiente vivo) ─────────────────────
function auditLiveEnvStep(step) {
  process.stdout.write(c('gray', `• ${step} … `))
  const envVar = baseline.requiresLiveEnv.envVar
  if (!process.env[envVar]) {
    console.log(c('yellow', `SKIPPED (${envVar} ausente — requer Supabase/seed vivo)`))
    return record(step, 'SKIPPED', [], `${envVar} não configurada`)
  }
  const r = run('npm', ['run', step], root)
  if (r.code === 0) { console.log(c('green', 'ok')); return record(step, 'PASS') }
  console.log(c('red', 'FALHA'))
  record(step, 'NEW_FAIL', [r.out.trim().split('\n').slice(-8).join('\n')])
}

// ── Execução sequencial ──────────────────────────────────────────────────────
console.log(c('bold', '\n🔎 Auditoria contínua — reporta só falhas novas (baseline em scripts/audit-baseline.json)\n'))
auditLint()
auditGuardCore()
auditLiveEnvStep('stress:pdv')
auditLiveEnvStep('gate:pdv')

// ── Resumo ───────────────────────────────────────────────────────────────────
const novas = results.filter((r) => r.status === 'NEW_FAIL' || r.status === 'ERROR')
console.log(c('bold', '\n── Resumo ──'))
for (const r of results) {
  const tag = r.status === 'PASS' ? c('green', 'PASS')
    : r.status === 'SKIPPED' ? c('yellow', 'SKIP')
    : r.status === 'NEW_FAIL' ? c('red', 'NOVA FALHA')
    : c('red', 'ERRO')
  console.log(`  ${tag}  ${r.step}${r.detail ? c('gray', `  (${r.detail})`) : ''}`)
  for (const i of r.newIssues) console.log(c('red', `      ↳ ${i}`))
}

if (novas.length > 0) {
  console.log(c('red', `\n✗ ${novas.length} step(s) com falha NOVA. Corrija ou, se intencional, atualize scripts/audit-baseline.json.\n`))
  process.exit(1)
}
console.log(c('green', '\n✓ Nenhuma regressão nova. (Falhas pré-existentes ignoradas via baseline.)\n'))
