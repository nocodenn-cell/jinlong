#!/usr/bin/env node
/**
 * CHECKLIST DERIVADO — auditoria mecânica de prontidão de migração (módulo Produtos).
 *
 * Objetivo: o checklist deixa de ser atestação manual e passa a ser DERIVADO do
 * repositório. Este script é EXCLUSIVAMENTE auditoria factual — inspeciona o
 * código e emite o estado de cada campo. Ele NÃO julga prontidão ("ready") nem
 * agrega decisão de migração (isso é escopo de outro script, ex. futuro
 * check:products:readiness). Saída: JSON com os campos factuais.
 *
 * Campos derivados:
 *   • routeAdded ......... rota do módulo presente (não-comentada) no themeRegistry
 *   • themeScopeApplied .. algum layout da cadeia da rota aplica data-theme (scope)
 *   • tokensOnly ......... ausência de classes Tailwind de paleta numerada
 *   • noHardcodedColors .. ausência de hex / rgba()/hsl() arbitrários e de
 *                          resolução de token via :root
 *   • visualValidated .... NÃO é derivável de código → default false
 *                          (override consciente via env VISUAL_VALIDATED=true)
 *
 * NOTA: as regras de cor abaixo ESPELHAM scripts/theme-tokens-guard.mjs (mantê-las
 * em sincronia). Este script NÃO altera nem depende do guard:theme — apenas reusa
 * a mesma definição de "cor proibida" para auditar os arquivos do módulo.
 *
 * Observabilidade apenas: não bloqueia pipeline nesta fase. O migration-checklist.json
 * manual passa a ser cache/derivável — esta auditoria é a fonte mecânica de verdade.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── Configuração do módulo (copiável para outros módulos) ─────────────────────
const MODULE = 'produtos'
const ROUTE = '/gerente/produtos'
// Tokens que identificam a rota no themeRegistry (literal e via ROUTES.*).
const ROUTE_REGISTRY_TOKENS = ["'/gerente/produtos'", 'ROUTES.gerente.produtos']
// Diretórios de UI do módulo (escaneados por hardcode).
const UI_PATHS = [
  'pdv-importados/app/gerente/produtos',
  'pdv-importados/components/gerente/produtos',
]
// Cadeia de layouts que envolve a rota (raiz → folha) p/ detectar o theme scope.
const LAYOUT_CHAIN = [
  'pdv-importados/app/layout.tsx',
  'pdv-importados/app/gerente/layout.tsx',
  'pdv-importados/app/gerente/produtos/layout.tsx',
]
const REGISTRY = 'pdv-importados/lib/theme/themeRegistry.ts'

// ── Regras de cor (espelham theme-tokens-guard.mjs) ───────────────────────────
const PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]
const UTIL_PREFIX = '(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|divide|outline|decoration|caret|accent|shadow|placeholder)'
const RULES = {
  paletteUtility: new RegExp(`\\b${UTIL_PREFIX}-(?:${PALETTE.join('|')})-[0-9]{2,3}\\b`),
  hexArbitrary: /-\[#[0-9a-fA-F]{3,8}\]/,
  colorFnArbitrary: /-\[(?:rgba?|hsla?)\(/,
  rootResolution: /getComputedStyle\(\s*document\.documentElement\s*\)/,
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8')
  } catch {
    return null
  }
}

function stripLineComments(src) {
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
}

function listFiles(rel) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [abs]
  const out = []
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(abs, e.name)
    if (e.isDirectory()) out.push(...listFiles(path.relative(root, child)))
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|behavior\.test)\.(ts|tsx)$/.test(e.name)) out.push(child)
  }
  return out
}

// ── Derivações ────────────────────────────────────────────────────────────────
function deriveRouteAdded() {
  const src = read(REGISTRY)
  if (!src) return { value: false, detail: `${REGISTRY} não encontrado` }
  const active = stripLineComments(src)
  const found = ROUTE_REGISTRY_TOKENS.some((t) => active.includes(t))
  return { value: found, detail: found ? `rota registrada` : `rota ausente em ${REGISTRY} (fora de comentário)` }
}

function deriveThemeScopeApplied(routeAdded) {
  // O scope só vale se a rota está registrada E algum layout da cadeia aplica data-theme.
  const layerWithScope = LAYOUT_CHAIN.find((rel) => {
    const src = read(rel)
    return src && (/AdminThemeScope/.test(src) || /data-theme=/.test(src))
  })
  const value = routeAdded && Boolean(layerWithScope)
  let detail
  if (!routeAdded) detail = 'rota não registrada (scope não se aplica)'
  else if (layerWithScope) detail = `scope aplicado em ${path.relative(root, path.join(root, layerWithScope))}`
  else detail = `nenhum layout da cadeia aplica data-theme (cadeia: ${LAYOUT_CHAIN.join(', ')})`
  return { value, detail }
}

function scanColors() {
  const files = UI_PATHS.flatMap(listFiles)
  const hits = { paletteUtility: [], hexArbitrary: [], colorFnArbitrary: [], rootResolution: [] }
  for (const file of files) {
    const rel = path.relative(root, file)
    read(rel).split('\n').forEach((line, i) => {
      for (const [rule, re] of Object.entries(RULES)) {
        if (re.test(line)) hits[rule].push(`${rel}:${i + 1}`)
      }
    })
  }
  return { filesScanned: files.length, hits }
}

const routeAdded = deriveRouteAdded()
const themeScope = deriveThemeScopeApplied(routeAdded.value)
const scan = scanColors()
const visualValidated = process.env.VISUAL_VALIDATED === 'true'

const tokensOnly = scan.hits.paletteUtility.length === 0
const noHardcodedColors =
  scan.hits.hexArbitrary.length === 0 &&
  scan.hits.colorFnArbitrary.length === 0 &&
  scan.hits.rootResolution.length === 0

// Apenas ESTADO FACTUAL do repositório — sem agregação de "pronto/não pronto".
// A decisão de prontidão (compor guard:theme + checklist + baseline) é
// responsabilidade de outro escopo (ex.: futuro check:products:readiness).
const checklist = {
  migration: MODULE,
  routeAdded: routeAdded.value,
  themeScopeApplied: themeScope.value,
  tokensOnly,
  noHardcodedColors,
  visualValidated,
}

const report = {
  ...checklist,
  derivedAt: new Date().toISOString(),
  source: 'derived',
  route: ROUTE,
  details: {
    routeAdded: routeAdded.detail,
    themeScopeApplied: themeScope.detail,
    filesScanned: scan.filesScanned,
    violations: {
      paletteUtility: scan.hits.paletteUtility.length,
      hexArbitrary: scan.hits.hexArbitrary.length,
      colorFnArbitrary: scan.hits.colorFnArbitrary.length,
      rootResolution: scan.hits.rootResolution.length,
    },
    sample: [
      ...scan.hits.paletteUtility.slice(0, 3),
      ...scan.hits.hexArbitrary.slice(0, 2),
    ],
    visualValidated: visualValidated
      ? 'override manual (VISUAL_VALIDATED=true)'
      : 'não derivável de código — default false',
  },
}

console.log(JSON.stringify(report, null, 2))
// Observabilidade: não falha o pipeline nesta fase.
process.exit(0)
