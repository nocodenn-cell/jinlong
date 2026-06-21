#!/usr/bin/env node
/**
 * PRICING RPC GUARD — RPC PostgreSQL é a única fonte de verdade de preços.
 *
 * Arquitetura consolidada (NÃO alterar sem decisão arquitetural explícita):
 *   - calcular_preco_produto(p_produto_id, p_quantidade, p_loja_id) SECURITY DEFINER
 *     é o ÚNICO mecanismo de cálculo de preço autorizado em produção.
 *   - PricingService (TypeScript) existe APENAS em testes de invariantes.
 *     Nunca pode ser importado em código de produção.
 *
 * Callers autorizados do RPC calcular_preco_produto:
 *   - pdv-importados/app/caixa/server/caixaPrecoProduto.impl.ts  (server action caixa)
 *   - pdv-importados/app/caixa/server/caixaPrecoAutoritativoServer.ts  (recálculo autoritativo)
 *
 * Toda mudança que viole estas regras DEVE quebrar o CI antes de chegar ao main.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ─── Callers autorizados do RPC de pricing ────────────────────────────────────
const AUTHORIZED_RPC_CALLERS = new Set([
  path.join(root, 'pdv-importados/app/caixa/server/caixaPrecoProduto.impl.ts'),
  path.join(root, 'pdv-importados/app/caixa/server/caixaPrecoAutoritativoServer.ts'),
])

// ─── Padrões proibidos em produção ───────────────────────────────────────────
// PricingService em produção: só é permitido em .test.ts / .spec.ts
const BLOCKED_IMPORT_PATTERNS = [
  { re: /import.*PricingService.*from/, msg: 'importa PricingService (deve ser usado APENAS em testes)' },
  { re: /new PricingService\s*\(/, msg: 'instancia PricingService (deve ser usado APENAS em testes)' },
  // Funções TS de cálculo de preço que não devem existir em produção
  { re: /calcularPrecoItem\s*\(/, msg: 'chama calcularPrecoItem() — use RPC calcular_preco_produto' },
  { re: /aplicarRegrasPreco\s*\(/, msg: 'chama aplicarRegrasPreco() — use RPC calcular_preco_produto' },
]

// ─── Diretórios de produção escaneados ───────────────────────────────────────
const PROD_DIRS = [
  path.join(root, 'pdv-importados/app'),
  path.join(root, 'pdv-importados/components'),
  path.join(root, 'pdv-importados/hooks'),
  path.join(root, 'pdv-importados/lib'),
  path.join(root, 'pdv-importados/stores'),
  path.join(root, 'pdv-importados/core'),
  path.join(root, 'shared-core/src'),
  path.join(root, 'backend/supabase/functions'),
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports', '__tests__'])

// Arquivos excluídos: gerados automaticamente, tipos apenas, sem lógica de runtime
const EXCLUDED_FILES = new Set([
  path.join(root, 'pdv-importados/lib/supabase/database.types.ts'),
])

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      out.push(...walk(p))
    } else if (
      /\.(ts|tsx)$/.test(ent.name) &&
      !ent.name.endsWith('.d.ts') &&
      !/\.(test|spec)\.(ts|tsx)$/.test(ent.name)
    ) {
      out.push(p)
    }
  }
  return out
}

const violations = []
const allProdFiles = PROD_DIRS.flatMap(walk)

const allProdFilesFiltered = allProdFiles.filter((f) => !EXCLUDED_FILES.has(f))

// ─── Regra 1: PricingService proibido em produção ────────────────────────────
for (const file of allProdFilesFiltered) {
  const rel = path.relative(root, file)
  const text = fs.readFileSync(file, 'utf8')
  for (const { re, msg } of BLOCKED_IMPORT_PATTERNS) {
    if (re.test(text)) {
      violations.push(`[PRICING-BLOCKED] ${rel}\n  → ${msg}`)
    }
  }
}

// ─── Regra 2: .rpc('calcular_preco_produto') só pode aparecer em callers autorizados
// Usa regex para distinguir chamadas reais de menções em comentários/JSDoc/tipos
const RPC_CALL_RE = /\.rpc\s*\(\s*['"]calcular_preco_produto['"]/
for (const file of allProdFilesFiltered) {
  if (AUTHORIZED_RPC_CALLERS.has(file)) continue
  const rel = path.relative(root, file)
  const text = fs.readFileSync(file, 'utf8')
  if (RPC_CALL_RE.test(text)) {
    violations.push(
      `[PRICING-CALLER] ${rel}\n  → Chama .rpc('calcular_preco_produto') diretamente.\n  → Callers autorizados: caixaPrecoProduto.impl.ts | caixaPrecoAutoritativoServer.ts\n  → Use a server action calcularPrecoProdutoCaixa() ou recalcularItensNoServidor().`,
    )
  }
}

// ─── Regra 3: calcular_preco_produto deve estar presente nos callers autorizados
//    (garante que ninguém silenciosamente removeu o RPC e substituiu por lógica TS)
for (const authFile of AUTHORIZED_RPC_CALLERS) {
  if (!fs.existsSync(authFile)) {
    violations.push(
      `[PRICING-MISSING] ${path.relative(root, authFile)}\n  → Arquivo de caller autorizado do RPC ausente — a remoção exige decisão arquitetural explícita.`,
    )
    continue
  }
  const text = fs.readFileSync(authFile, 'utf8')
  if (!RPC_CALL_RE.test(text)) {
    violations.push(
      `[PRICING-DRIFT] ${path.relative(root, authFile)}\n  → Não contém mais 'calcular_preco_produto' — o cálculo de preço foi silenciosamente removido do RPC?`,
    )
  }
}

// ─── Resultado ────────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.error('[pricing-rpc-guard] FAIL — violação de arquitetura de pricing:\n')
  for (const v of violations) console.error(`  - ${v}\n`)
  console.error(
    '  → REGRA: calcular_preco_produto (PostgreSQL SECURITY DEFINER) é a única fonte de verdade.' +
    '\n  → PricingService TypeScript existe APENAS em testes de invariantes (core/pricing/*.test.ts).' +
    '\n  → Qualquer mudança nessa arquitetura é uma decisão de engenharia — não um ajuste pontual.' +
    '\n  → Ver scripts/pricing-rpc-guard.mjs',
  )
  process.exit(1)
}

console.log('[pricing-rpc-guard] OK — RPC calcular_preco_produto é a única fonte de verdade de pricing')
