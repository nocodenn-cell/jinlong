#!/usr/bin/env node
/**
 * Gate R1 — invariante de vendabilidade única.
 *
 * Falha se caminhos de venda (caixa web) aplicarem `.eq('ativo'` em produtos
 * fora do módulo central `aplicarFiltroProdutoVendavel.ts`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const caixaDir = path.join(root, 'pdv-importados', 'app', 'caixa')
const filtroAutorizado = path.join(
  root,
  'pdv-importados',
  'lib',
  'catalog',
  'aplicarFiltroProdutoVendavel.ts',
)

const ALLOWED_ATIVO_EQ = new Set([path.normalize(filtroAutorizado)])

function walk(dir) {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p)
  }
  return out
}

const violations = []

for (const file of walk(caixaDir)) {
  const norm = path.normalize(file)
  if (norm.endsWith('.test.ts')) continue
  const text = fs.readFileSync(file, 'utf8')
  const touchesProdutos = /from\s*\(\s*['"]produtos['"]\s*\)/.test(text)
  const usesVendabilidadeCentral =
    /aplicarFiltroProdutoVendavel|filtrarSomenteProdutosVendaveis|isProdutoVendavel|primeiroProdutoVendavel/.test(
      text,
    )
  const produtoAtivoEq = /from\s*\(\s*['"]produtos['"]\s*\)[\s\S]{0,1200}?\.eq\s*\(\s*['"]ativo['"]/.test(
    text,
  )

  if (produtoAtivoEq && !ALLOWED_ATIVO_EQ.has(norm)) {
    violations.push(
      `${path.relative(root, file)}: .eq('ativo'…) em query produtos fora do filtro central`,
    )
  }
  if (touchesProdutos && !usesVendabilidadeCentral) {
    violations.push(
      `${path.relative(root, file)}: query produtos sem isProdutoVendavel / aplicarFiltroProdutoVendavel`,
    )
  }
}

const offlineLookup = path.join(root, 'pdv-local', 'src', 'catalogoLookup.ts')
const offlineText = fs.readFileSync(offlineLookup, 'utf8')
if (!offlineText.includes('isProdutoVendavel')) {
  violations.push('pdv-local/src/catalogoLookup.ts: deve usar isProdutoVendavel')
}
if (/if\s*\(\s*!?\s*p\.ativo\s*\)/.test(offlineText)) {
  violations.push('pdv-local/src/catalogoLookup.ts: uso direto de p.ativo como critério de venda')
}

const syncPath = path.join(root, 'backend', 'supabase', 'functions', 'sync-outbox', 'index.ts')
const syncText = fs.readFileSync(syncPath, 'utf8')
const catalogoSync =
  syncText.match(/async function handleCatalogoSync[\s\S]*?^}/m)?.[0] ?? syncText
if (!catalogoSync.includes('status_publicacao')) {
  violations.push('sync-outbox: SELECT catálogo deve incluir status_publicacao')
}
const produtosQueryChain =
  catalogoSync.match(
    /\.from\s*\(\s*["']produtos["']\s*\)([\s\S]*?)(?=\.from\s*\(\s*["']regras|,\s*supabase\s*\n\s*\.from\s*\(\s*["']regras)/,
  )?.[1] ?? ''
if (/\.eq\s*\(\s*["']ativo["']/.test(produtosQueryChain)) {
  violations.push('sync-outbox: não filtrar vendabilidade de produtos — apenas transportar dados')
}

if (violations.length > 0) {
  console.error('[check:vendabilidade] FAIL — invariante R1 violada:\n')
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}

console.log('[check:vendabilidade] OK — vendabilidade centralizada em isProdutoVendavel / aplicarFiltroProdutoVendavel')
