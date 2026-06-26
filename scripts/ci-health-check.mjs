#!/usr/bin/env node
/**
 * CI Health Check — diagnóstico leve do ambiente de build
 *
 * Uso: node scripts/ci-health-check.mjs
 *      npm run ci:health
 *      Disparado via ci-core.yml quando inputs.ci_debug=true
 *
 * Saída em três categorias:
 *   PASS  — OK, funcionando corretamente
 *   FAIL  — bug de código ou pipeline (sai com código 1)
 *   INFRA — falha de runner/network/ambiente (registra mas não bloqueia)
 *
 * Não roda testes completos nem build Next.js.
 * Objetivo: isolar "FAIL DE INFRA" de "FAIL DE CÓDIGO".
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const results = []

function pass(name, detail = '') { results.push({ name, status: 'PASS', detail: String(detail) }) }
function fail(name, detail = '') { results.push({ name, status: 'FAIL', detail: String(detail) }) }
function infra(name, detail = '') { results.push({ name, status: 'INFRA', detail: String(detail) }) }

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 120_000, stdio: 'pipe', ...opts }).trim()
}

// ── 1. Runtime ────────────────────────────────────────────────────────────────

const nodeVer = process.version
const [nodeMajor] = nodeVer.slice(1).split('.').map(Number)
if (nodeMajor >= 20) {
  pass('Node.js ≥ 20', nodeVer)
} else {
  fail('Node.js ≥ 20', `${nodeVer} — engines field requer >=20`)
}

try { pass('npm', run('npm --version')) } catch (e) { fail('npm', e.message) }
try { pass('npx turbo', run('npx turbo --version 2>&1')) } catch (e) { fail('npx turbo', e.message) }
try { pass('npx tsc', run('npx tsc --version 2>&1')) } catch (e) { fail('npx tsc', e.message) }

// ── 2. Workspace ──────────────────────────────────────────────────────────────

const pdvPkgPath = join(ROOT, 'pdv-importados/package.json')
if (existsSync(pdvPkgPath)) {
  const { name, version } = JSON.parse(readFileSync(pdvPkgPath, 'utf8'))
  pass('workspace pdv-importados', `${name}@${version}`)
} else {
  fail('workspace pdv-importados', 'pdv-importados/package.json não encontrado')
}

const files = [
  ['pdv-importados/tsconfig.typecheck.json', 'tsconfig.typecheck.json'],
  ['pdv-importados/.eslintrc.json', '.eslintrc.json'],
  ['turbo.json', 'turbo.json'],
  ['package-lock.json', 'package-lock.json'],
]
for (const [rel, label] of files) {
  if (existsSync(join(ROOT, rel))) {
    pass(label, 'presente')
  } else {
    fail(label, `${rel} não encontrado`)
  }
}

// ── 3. Binários nativos (falha de infra ≠ falha de código) ───────────────────

const SENTRYCLI_SKIP = process.env.SENTRYCLI_SKIP_DOWNLOAD
if (SENTRYCLI_SKIP === '1') {
  pass('SENTRYCLI_SKIP_DOWNLOAD', '=1 → download CDN bloqueado')
} else {
  infra('SENTRYCLI_SKIP_DOWNLOAD', `="${SENTRYCLI_SKIP ?? '<não definida>'}" — sentry-cli postinstall pode tentar https://downloads.sentry-cdn.com`)
}

const nativePkgs = [
  ['node_modules/@swc/core-linux-x64-gnu', '@swc/core linux-x64-gnu'],
  ['node_modules/@img/sharp-linux-x64', 'sharp linux-x64 prebuilt'],
]
for (const [rel, label] of nativePkgs) {
  if (existsSync(join(ROOT, rel))) {
    pass(label, 'instalado')
  } else {
    infra(label, 'ausente — normal em runners não-linux-x64 ou se opcional não instalou')
  }
}

const unrsPath = join(ROOT, 'pdv-importados/node_modules/unrs-resolver')
if (existsSync(unrsPath)) {
  const hasNative = existsSync(join(unrsPath, 'index.linux-x64-gnu.node'))
  if (hasNative) {
    pass('unrs-resolver', 'binário linux-x64-gnu presente')
  } else {
    infra('unrs-resolver', 'instalado mas binário .node não encontrado')
  }
} else {
  infra('unrs-resolver', 'não instalado')
}

// ── 4. Guard scripts (rápidos, sem build) ────────────────────────────────────

try {
  const out = run('npm run guard:all 2>&1')
  const okLines = out.split('\n').filter(l => l.includes('OK')).length
  pass('guard:all', `${okLines} guards OK`)
} catch (e) {
  const relevant = e.message.split('\n')
    .filter(l => l.includes('ERRO') || l.includes('Error') || l.includes('guard]'))
    .slice(0, 5).join('\n')
  fail('guard:all', relevant || e.message.slice(0, 300))
}

// ── 5. TypeScript dry-run (noEmit) ───────────────────────────────────────────

try {
  run('npx tsc --noEmit --skipLibCheck -p pdv-importados/tsconfig.typecheck.json 2>&1')
  pass('TypeScript noEmit', 'sem erros de tipo')
} catch (e) {
  const lines = e.message.split('\n').slice(0, 12).join('\n')
  fail('TypeScript noEmit', lines)
}

// ── 6. ESLint — lint de arquivo único no workspace correto ───────────────────
// Usa o eslint do workspace pdv-importados (Next.js preset), não o root eslint v10.

const pdvRoot = join(ROOT, 'pdv-importados')
try {
  // Lint de um arquivo só: valida config + parser sem varredura completa
  run('npx eslint app/page.tsx --ext .tsx 2>&1', { cwd: pdvRoot })
  pass('ESLint (pdv-importados)', 'config e parser OK')
} catch (e) {
  const lines = e.message.split('\n').slice(0, 8).join('\n')
  fail('ESLint (pdv-importados)', lines)
}

// ── Relatório ─────────────────────────────────────────────────────────────────

const PASS_COUNT  = results.filter(r => r.status === 'PASS').length
const FAIL_COUNT  = results.filter(r => r.status === 'FAIL').length
const INFRA_COUNT = results.filter(r => r.status === 'INFRA').length

console.log('\n╔═════════════════════════════════════════════════════════════╗')
console.log('║           CI Health Check — Diagnóstico de Pipeline         ║')
console.log('╚═════════════════════════════════════════════════════════════╝\n')

for (const r of results) {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'INFRA' ? '⚠' : '✗'
  console.log(`  ${icon} [${r.status.padEnd(5)}] ${r.name}${r.detail ? ': ' + r.detail.split('\n')[0] : ''}`)
  if (r.status !== 'PASS' && r.detail.includes('\n')) {
    r.detail.split('\n').slice(1, 4).forEach(line => console.log(`           ${line}`))
  }
}

console.log(`\n  ─── ${PASS_COUNT} PASS · ${INFRA_COUNT} INFRA · ${FAIL_COUNT} FAIL ───\n`)

if (FAIL_COUNT > 0) {
  console.log('  Diagnóstico: FAIL DE CÓDIGO ou PIPELINE')
  console.log('  → Itens [FAIL] acima identificam a causa raiz')
  console.log('  → Corrija o código/config antes de investigar infra\n')
  process.exit(1)
}

if (INFRA_COUNT > 0) {
  console.log('  Diagnóstico: FAIL DE INFRA (runner/network/ambiente)')
  console.log('  → Código está correto; problema é de ambiente CI')
  console.log('  → Verificar: proxy, optional deps, runner OS, network policy\n')
} else {
  console.log('  Diagnóstico: Setup CI completamente validado\n')
}
