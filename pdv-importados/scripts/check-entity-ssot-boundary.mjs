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

/** Arquivos legados órfãos — warn, não fail. Evidência de migração; remover após 1–2 releases. */
const LEGACY_ORPHAN_WARN = [
  '/app/gerente/financeiro/FinanceiroGerentePageClient.tsx',
  '/app/gerente/produtos/ProdutosGerentePageClient.tsx',
  '/app/gerente/vendas/VendasGerenteListClient.tsx',
  '/app/gerente/compras/ComprasGerentePageClient.tsx',
  '/app/gerente/relatorios/RelatoriosGerentePageClient.tsx',
]

/** Atalhos conhecidos — warn até redirecionar para tela oficial. */
const KNOWN_SHORTCUT_WARN = [
  {
    file: '/components/gerente/produtos/form/fields/FornecedorCombobox.tsx',
    symbol: 'FornecedorEditarModal',
    reason: 'Cadastro inline de fornecedor no form de produto; preferir /admin/fornecedores',
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
  return rel.endsWith('/actions.ts') || rel.endsWith('produtoService.ts')
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

  for (const { file: f, symbol, reason } of KNOWN_SHORTCUT_WARN) {
    if (rel.includes(f) && content.includes(symbol)) {
      console.warn(`[ssot:shortcut] ${rel} — ${reason}`)
      warned++
    }
  }

  if (isActionDefinition(rel)) continue

  for (const [symbol, allowed] of Object.entries(ALLOWED_UI)) {
    if (!content.includes(symbol)) continue
    if (allowed.length === 0 && content.includes(symbol)) {
      if (rel.includes('/app/gerente/financeiro/') && symbol === 'criarCliente') {
        console.error(`[ssot] ${rel} referencia ${symbol} — use /admin/clientes`)
        failed = true
      }
      continue
    }
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
