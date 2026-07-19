#!/usr/bin/env node
/**
 * Design System — burndown de legado (Fase 2 · Onda 3+)
 *
 * Conta consumidores restantes de padrões depreciados.
 * Uso: npm run check:ds-burndown
 * JSON: npm run check:ds-burndown -- --json
 * Atualizar baseline (só após redução genuína): --write-baseline
 *
 * Governança Fase 2: hits por métrica NUNCA podem subir vs baseline.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'reports', 'ds-legacy-burndown.json')
const BASELINE = join(ROOT, 'reports', 'ds-legacy-burndown.baseline.json')
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports', '.git', 'storybook-static'])

/** @type {{ id: string, label: string, re: RegExp, roots: string[] }[]} */
const METRICS = [
  {
    id: 'app_btn',
    label: '.app-btn-* (classes)',
    re: /app-btn-(?:accent|neutral|danger)/,
    roots: ['app', 'components'],
  },
  {
    id: 'gerente_table',
    label: 'GerenteTable import',
    re: /from ['"][^'"]*GerenteTable['"]/,
    roots: ['app', 'components'],
  },
  {
    id: 'login_premium_controls',
    label: 'login-premium-input|submit|label',
    re: /login-premium-(?:input|submit|label)/,
    roots: ['app/login'],
  },
  {
    id: 'text_arbitrary_px',
    label: 'text-[Npx] arbitrário',
    re: /text-\[\d+px\]/,
    roots: ['app', 'components'],
  },
  {
    id: 'hex_in_tsx',
    label: 'hex em className (tailwind)',
    re: /(?:text|bg|border)-\[#[0-9a-fA-F]{3,8}\]/,
    roots: ['app', 'components'],
  },
  {
    id: 'raw_dialog_caixa',
    label: 'role="dialog" no caixa',
    re: /role=["']dialog["']/,
    roots: ['app/caixa', 'components/caixa'],
  },
]

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (SKIP.has(name)) continue
      walk(p, files)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

function countMetric(metric) {
  let files = 0
  let hits = 0
  const samples = []
  for (const root of metric.roots) {
    for (const file of walk(join(ROOT, root))) {
      const text = readFileSync(file, 'utf8')
      const matches = text.match(new RegExp(metric.re.source, 'g'))
      if (!matches?.length) continue
      files += 1
      hits += matches.length
      if (samples.length < 8) {
        samples.push(`${relative(ROOT, file).replace(/\\/g, '/')} (${matches.length})`)
      }
    }
  }
  return { id: metric.id, label: metric.label, files, hits, samples }
}

const results = METRICS.map(countMetric)
const asOf = new Date().toISOString().slice(0, 10)
const report = { asOf, results }
const wantJson = process.argv.includes('--json')
const writeBaseline = process.argv.includes('--write-baseline')

mkdirSync(join(ROOT, 'reports'), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (writeBaseline) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ asOf, note: 'Fase 2 — teto de dívida visual; só atualizar após redução', results }, null, 2)}\n`,
    'utf8',
  )
  console.log(`Baseline gravado: ${relative(ROOT, BASELINE).replace(/\\/g, '/')}`)
}

/** @type {{ id: string, hits: number }[] | null} */
let regressions = null
if (existsSync(BASELINE) && !writeBaseline) {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const byId = new Map((baseline.results ?? []).map((r) => [r.id, r.hits]))
  regressions = []
  for (const r of results) {
    const floor = byId.get(r.id)
    if (typeof floor === 'number' && r.hits > floor) {
      regressions.push({ id: r.id, label: r.label, baseline: floor, current: r.hits })
    }
  }
}

if (wantJson) {
  console.log(JSON.stringify({ ...report, regressions: regressions ?? [] }, null, 2))
} else {
  console.log(`\nDS Legacy Burndown — ${asOf}\n`)
  for (const r of results) {
    const floor = existsSync(BASELINE)
      ? (JSON.parse(readFileSync(BASELINE, 'utf8')).results ?? []).find((b) => b.id === r.id)?.hits
      : undefined
    const delta =
      typeof floor === 'number' ? `  Δ${r.hits - floor >= 0 ? '+' : ''}${r.hits - floor}` : ''
    console.log(
      `  ${r.label.padEnd(40)} files=${String(r.files).padStart(3)}  hits=${String(r.hits).padStart(4)}${delta}`,
    )
  }
  console.log(`\nSnapshot: ${relative(ROOT, OUT).replace(/\\/g, '/')}`)
  if (existsSync(BASELINE)) {
    console.log(`Baseline: ${relative(ROOT, BASELINE).replace(/\\/g, '/')}`)
  }
  console.log('Meta: hits=0 antes de remover aliases do DS.\n')
}

if (regressions?.length) {
  console.error('\nREGRESSÃO visual — dívida acima do baseline (Fase 2):\n')
  for (const g of regressions) {
    console.error(`  ${g.label}: baseline=${g.baseline} → atual=${g.current}`)
  }
  console.error('\nCorrija antes do merge. Só atualize baseline com --write-baseline após redução genuína.\n')
  process.exit(1)
}
