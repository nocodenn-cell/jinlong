#!/usr/bin/env node
/**
 * Guarda SSoT de entidades — pós-consolidação Admin V2.
 *
 * Regra: criação/alteração de Produto, Cliente, Fornecedor e Estoque manual
 * deve ocorrer somente nas telas oficiais (ou actions compartilhadas delas).
 *
 * Uso: node scripts/check-entity-ssot-boundary.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = join(ROOT, 'app')
const COMPONENTS = join(ROOT, 'components')

/** UI permitida a invocar mutações (paths normalizados com /). */
const ALLOWED_UI = {
  criarProduto: [
    '/app/admin/catalogo/',
    '/components/gerente/produtos/',
    '/app/admin/estoque/importar-nfe/',
    '/app/gerente/estoque/importar-nfe/',
    // Porta canônica de criação (hexagonal): ProductWriter → RPC 270 (PR #219).
    '/app/admin/produtos/productWriter.ts',
    // A exceção do PDV relâmpago saiu daqui junto com o código: o caixa não
    // cria produto. Não reintroduzir /app/caixa/ nesta lista.
  ],
  salvarClienteAction: [
    '/app/admin/clientes/',
    '/app/gerente/clientes/',
  ],
  salvarFornecedorAction: [
    '/app/admin/fornecedores/',
    '/app/gerente/fornecedores/',
  ],
  atualizarEstoqueProduto: [
    '/app/admin/estoque/',
    '/app/gerente/estoque/',
  ],
  criarCliente: [],
  criarTituloReceber: [
    '/app/admin/financeiro/',
  ],
}

/**
 * Match de identificador (evita falso positivo em nomes que contêm o símbolo,
 * ex.: `criarProdutoComEstoqueInicialRpc` vs. `criarProduto`).
 */
function referencesSymbol(content, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(content)
}

/** Arquivos legados órfãos — warn, não fail. Evidência de migração; remover após 1–2 releases. */
const LEGACY_ORPHAN_WARN = [
  '/app/gerente/financeiro/FinanceiroGerentePageClient.tsx',
  '/app/gerente/produtos/ProdutosGerentePageClient.tsx',
  '/app/gerente/vendas/VendasGerenteListClient.tsx',
  '/app/gerente/compras/ComprasGerentePageClient.tsx',
  '/app/gerente/relatorios/RelatoriosGerentePageClient.tsx',
]

/**
 * UI pode iniciar operação de outro domínio se usar o comando canônico.
 * FornecedorCombobox + FornecedorEditarModal → createSupplier / salvarFornecedorAction.
 */
const ALLOWED_CROSS_DOMAIN_UI = [
  {
    file: '/components/gerente/produtos/form/fields/FornecedorCombobox.tsx',
    mustInclude: 'FornecedorEditarModal',
    reason: 'OK: modal inicia createSupplier (domínio Suppliers), sem INSERT próprio',
  },
]

/** Writers mortos / bypass — fail hard. */
const FORBIDDEN_SYMBOLS = [
  {
    fileIncludes: '/app/gerente/financeiro/',
    symbol: 'enfileirarDocFiscalStub',
    reason: 'Removido — enqueue só via fiscal_enfileirar_*',
  },
  {
    fileIncludes: '/app/gerente/financeiro/',
    symbol: 'criarCliente',
    reason: 'Removido — clientes só via CustomerWriter /admin/clientes',
  },
]

/** INSERT direto em tabelas de entidade — só writers autorizados. */
const FORBIDDEN_TABLE_INSERTS = [
  {
    table: 'clientes',
    allowedPathIncludes: [
      '/app/admin/clientes/customerWriter.ts',
      '/app/admin/clientes/actions.ts',
      '/app/gerente/clientes/',
    ],
  },
  {
    table: 'documentos_fiscais_pendentes',
    allowedPathIncludes: [
      // Nenhum app path — só RPC SECURITY DEFINER / service_role / testes
    ],
    allowTests: true,
  },
]

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, files)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

function normPath(abs) {
  return normalize(abs).replace(/\\/g, '/').slice(normalize(ROOT).replace(/\\/g, '/').length)
}

function isAllowed(rel, allowedPrefixes) {
  return allowedPrefixes.some((prefix) => rel.includes(prefix))
}

function isActionDefinition(rel) {
  return rel.endsWith('/actions.ts')
}

const files = [...walk(APP), ...walk(COMPONENTS)]
let failed = false
let warned = 0

for (const file of files) {
  const rel = normPath(file)
  const content = readFileSync(file, 'utf8')

  if (LEGACY_ORPHAN_WARN.some((p) => rel.includes(p))) {
    console.warn(`[ssot:orphan] ${rel} — @legacy Gerente; migrado para Admin V2; remover após validação`)
    warned++
    continue
  }

  for (const { file: f, mustInclude, reason } of ALLOWED_CROSS_DOMAIN_UI) {
    if (rel.includes(f) && content.includes(mustInclude)) {
      console.log(`[ssot:cross-domain-ok] ${rel} — ${reason}`)
    }
  }

  for (const { fileIncludes, symbol, reason } of FORBIDDEN_SYMBOLS) {
    if (rel.includes(fileIncludes) && referencesSymbol(content, symbol)) {
      console.error(`[ssot:forbidden] ${rel} — ${symbol}: ${reason}`)
      failed = true
    }
  }

  for (const rule of FORBIDDEN_TABLE_INSERTS) {
    const insertRe = new RegExp(
      String.raw`\.from\(\s*['"]${rule.table}['"]\s*\)[\s\S]{0,120}?\.insert\s*\(`,
      'm',
    )
    if (!insertRe.test(content)) continue
    const allowed = (rule.allowedPathIncludes || []).some((p) => rel.includes(p))
    const isTest = /\.(spec|test)\.(ts|tsx)$/.test(rel) || rel.includes('/e2e/')
    if (allowed || (rule.allowTests && isTest)) continue
    // Definições em actions canônicas de clientes já cobertas por allowedPath
    if (isActionDefinition(rel) && rule.table === 'clientes' && rel.includes('/clientes/')) continue
    console.error(`[ssot:insert] ${rel} faz .from('${rule.table}').insert fora do writer canônico`)
    failed = true
  }

  if (isActionDefinition(rel)) continue

  for (const [symbol, allowed] of Object.entries(ALLOWED_UI)) {
    if (!referencesSymbol(content, symbol)) continue
    if (allowed.length === 0) continue
    if (!isAllowed(rel, allowed)) {
      console.error(`[ssot] ${rel} referencia ${symbol} fora das telas oficiais`)
      failed = true
    }
  }
}

const deadRoutes = [
  join(APP, 'admin', 'financeiro', '_components', 'FinanceiroPanels.tsx'),
]
for (const p of deadRoutes) {
  if (existsSync(p)) {
    console.error(`[ssot:dead] ${relative(ROOT, p)} ainda existe (código morto pós-consolidação)`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log(`check-entity-ssot-boundary: OK (${warned} aviso(s) legado)`)
