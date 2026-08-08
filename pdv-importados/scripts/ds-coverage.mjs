#!/usr/bin/env node
/**
 * Design System — cobertura de migração (Fase 2)
 *
 * Métricas:
 * - % telas migradas
 * - % TSX com imports DS
 * - Componentes exclusivos por módulo (tendendo a zero)
 *
 * Uso: npm run check:ds-coverage
 */
import { basename, join, relative } from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'reports', 'ds-coverage.json')

/** Telas oficiais da Fase 2 (ordem de migração). */
const SCREENS = [
  { id: 'login', path: 'app/login', migrated: true },
  { id: 'pdv', path: 'app/caixa', migrated: true, note: '1ª passagem' },
  { id: 'dashboard', path: 'app/admin/dashboard', migrated: true },
  {
    id: 'catalogo',
    path: 'app/admin/catalogo',
    migrated: true,
    note: 'Módulo único: Produtos + Categorias + Fornecedores',
  },
  { id: 'clientes', path: 'app/admin/clientes', migrated: true },
  {
    id: 'estoque',
    path: 'app/admin/estoque',
    migrated: true,
    note: 'Teste definitivo DS — movimentos + kardex',
  },
  { id: 'financeiro', path: 'app/admin/financeiro', migrated: true, note: 'UX-08 pagar DataTable; receber/fiscal parcial' },
  { id: 'funcionarios', path: 'app/admin/funcionarios', migrated: true },
  { id: 'configuracoes', path: 'app/admin/configuracoes', migrated: false },
  { id: 'implantacao', path: 'app/admin/implantacao', migrated: false },
  { id: 'provisionamento', path: 'app/admin/provisionamento', migrated: false },
  { id: 'pdv-polish', path: 'app/caixa', migrated: false, note: 'polish final' },
]

/** Superfícies do módulo Catálogo. */
const CATALOG_SURFACES = [
  'app/admin/catalogo',
  'app/admin/categorias-produtos',
  'app/admin/fornecedores',
  'app/gerente/fornecedores',
]

/**
 * Módulos migrados — hosts de página/list/modal permitidos.
 * Qualquer outro .tsx sob essas raízes conta como componente exclusivo.
 */
const MODULE_EXCLUSIVE = [
  {
    id: 'clientes',
    roots: ['app/admin/clientes', 'app/gerente/clientes'],
    allowedHosts: new Set([
      'page.tsx',
      'ClientesListClient.tsx',
      'ClienteEditarModal.tsx',
    ]),
  },
  {
    id: 'catalogo',
    roots: [
      'app/admin/catalogo',
      'app/admin/categorias-produtos',
      'app/admin/fornecedores',
      'app/gerente/fornecedores',
    ],
    allowedHosts: new Set([
      'page.tsx',
      'CatalogoTable.tsx',
      'CatalogoHeaderActions.tsx',
      'CatalogoPublicacaoActions.tsx',
      'CatalogoNovoButton.tsx',
      'CategoriasProdutosContent.tsx',
      'FornecedoresListClient.tsx',
      'FornecedorEditarModal.tsx',
    ]),
  },
  {
    id: 'dashboard',
    roots: ['app/admin/dashboard'],
    allowedHosts: new Set([
      'page.tsx',
      'DashboardFilters.tsx',
      'DashboardOrdersTable.tsx',
      'DashboardCharts.tsx',
      'CaixaShortcut.tsx',
    ]),
  },
  {
    id: 'estoque',
    roots: [
      'app/admin/estoque',
      'app/gerente/estoque',
      'app/gerente/transferencias',
      'app/gerente/recebimento',
      'app/gerente/relatorios/estoque',
    ],
    allowedHosts: new Set([
      'page.tsx',
      'EstoqueTable.tsx',
      'AjusteSaldoModal.tsx',
      'KardexSheet.tsx',
      'TransferenciasGerentePageClient.tsx',
      'RecebimentoGerentePageClient.tsx',
      'ImportarNfePageClient.tsx',
      'ImprimirEtiquetasPageClient.tsx',
      'EtiquetaCarrinho.tsx',
      'RelatorioEstoqueClient.tsx',
    ]),
  },
]

const APPROVED_EXCEPTIONS = [
  {
    id: 'login-ceremonial-theme',
    reason: 'Tema login em styles/ds/login-theme.css (exceção cerimonial documentada)',
  },
  {
    id: 'chart-canvas-sizes',
    reason: 'Dimensões de canvas de gráfico (sparkline/Chart.js) não são tipografia',
  },
]

const DS_IMPORT_RE =
  /from ['"]@\/components\/ui\/(?:button|forms|feedback|DataTable|FilterBar|admin-v2|badge|badges|skeleton|DragonModal|StatusChip|MovementBadge|QuantityCell)/

function walkTsx(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walkTsx(p, files)
    } else if (/\.tsx$/.test(name) && !/\.(spec|test)\.tsx$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

let dsImportFiles = 0
let tsxTotal = 0
for (const file of walkTsx(join(ROOT, 'app'))) {
  tsxTotal += 1
  if (DS_IMPORT_RE.test(readFileSync(file, 'utf8'))) dsImportFiles += 1
}

const migrated = SCREENS.filter((s) => s.migrated).length

let catalogTsx = 0
let catalogDs = 0
for (const surface of CATALOG_SURFACES) {
  for (const file of walkTsx(join(ROOT, surface))) {
    catalogTsx += 1
    if (DS_IMPORT_RE.test(readFileSync(file, 'utf8'))) catalogDs += 1
  }
}

/** Componentes exclusivos = TSX de UI além dos hosts List/Modal/page. */
function countExclusive(mod) {
  const samples = []
  for (const root of mod.roots) {
    for (const file of walkTsx(join(ROOT, root))) {
      const base = basename(file)
      if (mod.allowedHosts.has(base)) continue
      samples.push(relative(ROOT, file).replace(/\\/g, '/'))
    }
  }
  return { id: mod.id, count: samples.length, samples: samples.slice(0, 12) }
}

const exclusiveByModule = MODULE_EXCLUSIVE.map(countExclusive)
const exclusiveTotal = exclusiveByModule.reduce((s, m) => s + m.count, 0)

const report = {
  asOf: new Date().toISOString().slice(0, 10),
  screens: {
    total: SCREENS.length,
    migrated,
    pct: Math.round((migrated / SCREENS.length) * 100),
    list: SCREENS,
  },
  catalogModule: {
    surfaces: CATALOG_SURFACES,
    tsxTotal: catalogTsx,
    filesWithDsImport: catalogDs,
    pct: catalogTsx ? Math.round((catalogDs / catalogTsx) * 100) : 0,
  },
  exclusiveComponents: {
    objective: 'tendendo a zero',
    total: exclusiveTotal,
    byModule: exclusiveByModule,
  },
  dsImports: {
    appTsxTotal: tsxTotal,
    filesWithDsImport: dsImportFiles,
    pct: tsxTotal ? Math.round((dsImportFiles / tsxTotal) * 100) : 0,
  },
  approvedExceptions: APPROVED_EXCEPTIONS,
}

mkdirSync(join(ROOT, 'reports'), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`\nDS Coverage — ${report.asOf}`)
console.log(`  Telas migradas:     ${migrated}/${SCREENS.length} (${report.screens.pct}%)`)
console.log(
  `  Módulo Catálogo:    ${catalogDs}/${catalogTsx} TSX com DS (${report.catalogModule.pct}%)`,
)
console.log(`  App TSX com DS:     ${dsImportFiles}/${tsxTotal} (${report.dsImports.pct}%)`)
console.log(`  Exclusivos/módulo:  ${exclusiveTotal} (meta → 0)`)
for (const m of exclusiveByModule) {
  console.log(`    · ${m.id.padEnd(12)} ${m.count}`)
}
console.log(`  Exceções aprovadas: ${APPROVED_EXCEPTIONS.length}`)
console.log(`\nSnapshot: ${relative(ROOT, OUT).replace(/\\/g, '/')}\n`)
