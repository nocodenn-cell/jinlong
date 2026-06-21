#!/usr/bin/env node
/**
 * PRICING RPC GUARD — autoridade de pricing por ZONA, baseada em imports.
 *
 * Arquitetura consolidada (NÃO alterar sem decisão arquitetural explícita):
 *
 *   ONLINE (pdv-importados, shared-core, edge functions):
 *     - calcular_preco_produto(...) SECURITY DEFINER é a ÚNICA fonte de verdade.
 *     - PricingService (TypeScript) é PROIBIDO em runtime — só em testes.
 *
 *   OFFLINE (pdv-local/src) — EXCEÇÃO EXPLÍCITA:
 *     - O PDV local é offline-first e não alcança o RPC sem rede.
 *     - PricingService é PERMITIDO aqui como motor de cálculo offline.
 *     - A equivalência Offline×RPC é garantida por golden test (não por este guard).
 *
 * Detecção: este guard analisa IMPORTS (grafo de dependência), não busca textual.
 * Menções em comentários/JSDoc/strings não disparam violação — apenas imports reais
 * do motor de pricing e chamadas .rpc() reais.
 *
 * Callers autorizados do RPC calcular_preco_produto:
 *   - pdv-importados/app/caixa/server/caixaPrecoProduto.impl.ts
 *   - pdv-importados/app/caixa/server/caixaPrecoAutoritativoServer.ts
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

// ─── Zonas ────────────────────────────────────────────────────────────────────
// BLOCKED: runtime online — PricingService proibido (RPC é autoridade).
const BLOCKED_ZONES = [
  path.join(root, 'pdv-importados/app'),
  path.join(root, 'pdv-importados/components'),
  path.join(root, 'pdv-importados/hooks'),
  path.join(root, 'pdv-importados/lib'),
  path.join(root, 'pdv-importados/stores'),
  path.join(root, 'pdv-importados/core'),
  path.join(root, 'shared-core/src'),
  path.join(root, 'backend/supabase/functions'),
]
// ALLOWED: runtime offline (exceção declarada) — PricingService permitido.
const ALLOWED_ZONE = path.join(root, 'pdv-local/src')

// Todas as zonas escaneadas (blocked + allowed); a regra aplica-se por zona.
const SCAN_DIRS = [...BLOCKED_ZONES, ALLOWED_ZONE]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports', '__tests__'])

// Arquivos gerados / só-tipos — sem lógica de runtime.
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

const isAllowedZone = (file) => file.startsWith(ALLOWED_ZONE + path.sep)

/**
 * Análise baseada em imports: extrai (bindings, especificador de módulo) de cada
 * `import ... from '...'`, mesmo multilinha. Retorna os motivos de pricing-engine
 * encontrados via grafo de dependência — não via texto solto.
 */
const IMPORT_RE = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
const PRICING_FN_NAMES = ['calcularPrecoItem', 'aplicarRegrasPreco', 'calcularPrecoTotal']

function pricingEngineImports(text) {
  const reasons = []
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const bindings = m[1]
    const spec = m[2]
    // (a) importa o módulo do motor (classe/singleton PricingService)
    if (/(^|\/)PricingService$/.test(spec) || /pricing\/PricingService/.test(spec)) {
      reasons.push(`importa o módulo PricingService de '${spec}'`)
      continue
    }
    // (b) importa uma função-motor de pricing de qualquer módulo de pricing
    if (/pricing/i.test(spec)) {
      for (const fn of PRICING_FN_NAMES) {
        if (new RegExp(`\\b${fn}\\b`).test(bindings)) {
          reasons.push(`importa '${fn}' de '${spec}'`)
        }
      }
    }
  }
  return reasons
}

const RPC_CALL_RE = /\.rpc\s*\(\s*['"]calcular_preco_produto['"]/

// ─── Execução ─────────────────────────────────────────────────────────────────
const violations = []
const files = SCAN_DIRS.flatMap(walk).filter((f) => !EXCLUDED_FILES.has(f))

for (const file of files) {
  const rel = path.relative(root, file)
  const text = fs.readFileSync(file, 'utf8')

  // Regra 1 (zonal): import do motor de pricing proibido fora de pdv-local/src
  if (!isAllowedZone(file)) {
    const reasons = pricingEngineImports(text)
    for (const r of reasons) {
      violations.push(
        `[PRICING-BLOCKED] ${rel}\n  → ${r}\n  → Runtime online é RPC-only: use calcular_preco_produto. PricingService só é permitido em pdv-local/src (offline).`,
      )
    }
  }

  // Regra 2: .rpc('calcular_preco_produto') só em callers autorizados
  if (!AUTHORIZED_RPC_CALLERS.has(file) && RPC_CALL_RE.test(text)) {
    violations.push(
      `[PRICING-CALLER] ${rel}\n  → Chama .rpc('calcular_preco_produto') diretamente.\n  → Callers autorizados: caixaPrecoProduto.impl.ts | caixaPrecoAutoritativoServer.ts`,
    )
  }
}

// Regra 3: os callers autorizados ainda chamam o RPC (anti-drift silencioso)
for (const authFile of AUTHORIZED_RPC_CALLERS) {
  if (!fs.existsSync(authFile)) {
    violations.push(
      `[PRICING-MISSING] ${path.relative(root, authFile)}\n  → Caller autorizado do RPC ausente — remoção exige decisão arquitetural explícita.`,
    )
    continue
  }
  if (!RPC_CALL_RE.test(fs.readFileSync(authFile, 'utf8'))) {
    violations.push(
      `[PRICING-DRIFT] ${path.relative(root, authFile)}\n  → Não chama mais calcular_preco_produto — pricing foi silenciosamente movido para fora do RPC?`,
    )
  }
}

if (violations.length > 0) {
  console.error('[pricing-rpc-guard] FAIL — violação de arquitetura de pricing:\n')
  for (const v of violations) console.error(`  - ${v}\n`)
  console.error(
    '  → ONLINE (pdv-importados/shared-core/edge): RPC calcular_preco_produto é a única autoridade.' +
    '\n  → OFFLINE (pdv-local/src): PricingService permitido como exceção declarada; equivalência via golden test.' +
    '\n  → Detecção por imports (grafo de dependência). Ver scripts/pricing-rpc-guard.mjs',
  )
  process.exit(1)
}

console.log('[pricing-rpc-guard] OK — online RPC-only; offline pdv-local/src isolado (exceção declarada)')
