#!/usr/bin/env node
/**
 * BOUNDARY RATCHET GUARD — Sprint 1 / tarefa 0.3 do plano de modularização.
 *
 * Congela (não corrige) violações de fronteira JÁ existentes: nada novo pode
 * entrar; o que existe só pode diminuir. A baseline vive em
 * `scripts/boundary-ratchet.baseline.json`.
 *
 * Regras:
 *  lib-to-app        pdv-importados/lib/**        importa '@/app/…'
 *  ui-to-app         pdv-importados/components/ui/** importa '@/app/…'
 *  components-to-app pdv-importados/components/** (fora de ui) importa '@/app/…'
 *  shared-to-apps    shared/** (raiz) importa pdv-importados | pdv-local   (meta: 0)
 *  routes-coupling   nº de arquivos que importam '@shared-core/navigation/routes' (alias antigo) e
 *                    existência de shared-core/navigation/routes.ts (meta: 0 e 0)
 *  direct-from       uso direto de `.from('<tabela de domínio>')` em app/ e lib/ (por arquivo+tabela)
 *  shared-core-externals  pacotes externos importados por shared-core (produção) e imports relativos que
 *                    escapam do pacote — hoje só `zustand`, 0 escapes (independência do shared-core)
 *  duplicates        declarações duplicadas conhecidas (StatusPublicacao, OrigemProduto,
 *                    mensagemErroUsuario, unified-logger)
 *
 * Uso:
 *   node scripts/boundary-ratchet-guard.mjs            # verifica (falha se piorar)
 *   node scripts/boundary-ratchet-guard.mjs --update   # regrava a baseline (recusa se piorar)
 *   node scripts/boundary-ratchet-guard.mjs --update --allow-growth   # exceção consciente
 *
 * Melhorias (contagem abaixo da baseline) NÃO falham: geram aviso para que a
 * baseline seja reduzida com `--update`, travando o ganho.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// `BOUNDARY_RATCHET_ROOT` existe só para o teste automatizado (árvore fixture).
const root = process.env.BOUNDARY_RATCHET_ROOT
  ? path.resolve(process.env.BOUNDARY_RATCHET_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = path.join(root, 'scripts', 'boundary-ratchet.baseline.json')
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.git', '.turbo', 'storybook-static'])
const DOMAIN_TABLES = [
  'produtos',
  'estoque',
  'clientes',
  'contas_receber',
  'contas_pagar',
  'caixas',
  'movimentacoes_caixa',
]

const update = process.argv.includes('--update')
const allowGrowth = process.argv.includes('--allow-growth')

function toPosix(p) {
  return p.split(path.sep).join('/')
}
function rel(p) {
  return toPosix(path.relative(root, p))
}
function isTestFile(name) {
  return /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(name) || /\.stories\.(ts|tsx)$/.test(name)
}
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name === '__tests__' || name === '__mocks__') continue
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !isTestFile(name)) acc.push(full)
  }
  return acc
}
function read(file) {
  return fs.readFileSync(file, 'utf8')
}

const IMPORT_APP = /(?:from\s+|import\s*\(\s*)['"]@\/app\/[^'"]*['"]/g
function appImports(text) {
  return (text.match(IMPORT_APP) || []).length
}

/** @returns {Record<string, Record<string, number>>} regra -> chave -> contagem */
function measure() {
  const out = {
    'lib-to-app': {},
    'ui-to-app': {},
    'components-to-app': {},
    'shared-to-apps': {},
    'routes-coupling': {},
    'direct-from': {},
    'shared-core-externals': {},
    duplicates: {},
  }

  const pdv = path.join(root, 'pdv-importados')

  for (const f of walk(path.join(pdv, 'lib'))) {
    const n = appImports(read(f))
    if (n) out['lib-to-app'][rel(f)] = n
  }
  for (const f of walk(path.join(pdv, 'components'))) {
    const n = appImports(read(f))
    if (!n) continue
    const r = rel(f)
    if (r.startsWith('pdv-importados/components/ui/')) out['ui-to-app'][r] = n
    else out['components-to-app'][r] = n
  }

  for (const f of walk(path.join(root, 'shared'))) {
    const text = read(f)
    const n = (text.match(/from\s+['"][^'"]*(?:pdv-importados|pdv-local)\//g) || []).length
    if (n) out['shared-to-apps'][rel(f)] = n
  }

  // acoplamento às rotas do Jinlong dentro do shared-core
  let routeImporters = 0
  for (const base of ['pdv-importados', 'pdv-local', 'shared-core', 'shared']) {
    for (const f of walk(path.join(root, base))) {
      if (/@shared-core\/navigation\/routes|shared-core\/navigation\/routes/.test(read(f))) routeImporters++
    }
  }
  out['routes-coupling']['arquivos-importando-shared-core/navigation/routes'] = routeImporters
  // rotas do Jinlong não podem voltar a viver dentro do shared-core (foram para pdv-importados/lib/navigation)
  out['routes-coupling']['shared-core/navigation/routes.ts-existe'] = fs.existsSync(
    path.join(root, 'shared-core', 'navigation', 'routes.ts'),
  )
    ? 1
    : 0

  // independência do shared-core: externos (arquivos distintos por pacote) e imports relativos que escapam
  const coreRoot = path.join(root, 'shared-core')
  const importRe = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
  const filesByKey = {}
  for (const f of walk(coreRoot)) {
    if (/\.config\.(ts|mjs|js)$/.test(path.basename(f))) continue // config de tooling, não é código de produção
    const text = read(f)
    let m
    while ((m = importRe.exec(text))) {
      const spec = m[1]
      let k = null
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(f), spec)
        if (!(target + path.sep).startsWith(coreRoot + path.sep)) k = 'escape-relativo'
      } else if (!spec.startsWith('node:')) {
        const parts = spec.split('/')
        k = `externo:${spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]}`
      }
      if (k) (filesByKey[k] ||= new Set()).add(f)
    }
  }
  for (const [k, set] of Object.entries(filesByKey)) out['shared-core-externals'][k] = set.size

  // uso direto de .from('<tabela>') fora de testes
  const fromRe = new RegExp(`\\.from\\(\\s*['"](${DOMAIN_TABLES.join('|')})['"]\\s*\\)`, 'g')
  for (const base of [path.join(pdv, 'app'), path.join(pdv, 'lib')]) {
    for (const f of walk(base)) {
      const text = read(f)
      let m
      const counts = {}
      while ((m = fromRe.exec(text))) counts[m[1]] = (counts[m[1]] || 0) + 1
      for (const [table, n] of Object.entries(counts)) out['direct-from'][`${rel(f)}|${table}`] = n
    }
  }

  // duplicações conhecidas
  const sources = [
    ...walk(path.join(pdv, 'core')),
    ...walk(path.join(pdv, 'lib')),
    ...walk(path.join(pdv, 'shared')),
    ...walk(path.join(pdv, 'app')),
    ...walk(path.join(root, 'shared-core', 'src')),
    ...walk(path.join(root, 'shared')),
    ...walk(path.join(root, 'pdv-local', 'src')),
  ]
  let statusDecl = 0
  let origemDecl = 0
  let mensagemImpl = 0
  let loggerFiles = 0
  for (const f of sources) {
    const text = read(f)
    if (/^\s*export\s+type\s+StatusPublicacao\s*=/m.test(text)) statusDecl++
    if (/^\s*export\s+type\s+OrigemProduto\s*=/m.test(text)) origemDecl++
    if (/export\s+function\s+mensagemErroParaUsuario\b/.test(text)) mensagemImpl++
    if (path.basename(f) === 'unified-logger.ts' && !/export\s+\*\s+from/.test(text)) loggerFiles++ // shim não conta
  }
  out.duplicates['declaracoes-StatusPublicacao'] = statusDecl
  out.duplicates['declaracoes-OrigemProduto'] = origemDecl
  out.duplicates['implementacoes-mensagemErroParaUsuario'] = mensagemImpl
  out.duplicates['arquivos-unified-logger'] = loggerFiles
  return out
}

const current = measure()

if (update) {
  if (fs.existsSync(BASELINE) && !allowGrowth) {
    const prev = JSON.parse(read(BASELINE))
    const worse = compare(prev, current).regressions
    if (worse.length) {
      console.error('boundary-ratchet: --update recusado (há regressões). Use --allow-growth só como exceção consciente:')
      for (const w of worse) console.error('  - ' + w)
      process.exit(1)
    }
  }
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
  console.log(`boundary-ratchet: baseline gravada em ${rel(BASELINE)}`)
  summarize(current)
  process.exit(0)
}

if (!fs.existsSync(BASELINE)) {
  console.error('boundary-ratchet: baseline ausente. Gere com --update.')
  process.exit(1)
}

const baseline = JSON.parse(read(BASELINE))
const { regressions, improvements } = compare(baseline, current)

if (improvements.length) {
  console.warn(`boundary-ratchet: ${improvements.length} melhoria(s) — rode --update para travar o ganho:`)
  for (const i of improvements.slice(0, 15)) console.warn('  + ' + i)
  if (improvements.length > 15) console.warn(`  … (+${improvements.length - 15})`)
}
if (regressions.length) {
  console.error(`boundary-ratchet: FAIL (${regressions.length} regressão/ões de fronteira):`)
  for (const r of regressions) console.error('  - ' + r)
  console.error('Corrija a violação nova. Se for intencional, discuta e use --update --allow-growth.')
  process.exit(1)
}
console.log('boundary-ratchet: OK')
summarize(current)

function compare(base, cur) {
  const regressions = []
  const improvements = []
  const rules = new Set([...Object.keys(base), ...Object.keys(cur)])
  for (const rule of rules) {
    const b = base[rule] || {}
    const c = cur[rule] || {}
    const keys = new Set([...Object.keys(b), ...Object.keys(c)])
    for (const k of keys) {
      const bv = b[k] ?? 0
      const cv = c[k] ?? 0
      if (cv > bv) regressions.push(`[${rule}] ${k}: ${bv} → ${cv}`)
      else if (cv < bv) improvements.push(`[${rule}] ${k}: ${bv} → ${cv}`)
    }
  }
  return { regressions, improvements }
}

function summarize(cur) {
  const parts = Object.entries(cur).map(([rule, m]) => {
    const total = Object.values(m).reduce((a, b) => a + b, 0)
    return `${rule}=${total}`
  })
  console.log('  ' + parts.join('  '))
}
