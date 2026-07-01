#!/usr/bin/env node
/**
 * AUTHORITY GUARD — containment determinístico de writes diretos em tabelas críticas.
 *
 * Escopo (Iteração 1 — e SÓ isto):
 *   1. Detecção LITERAL: `.from('<tabela crítica>')` seguido de
 *      `.insert(` / `.update(` / `.upsert(` / `.delete(`.
 *   2. ALLOWLIST estática: lista explícita de exceções (writes que já existiam).
 *   3. Enforcement binário: CI falha (exit 1) se um write direto NÃO estiver na
 *      allowlist. Caso contrário, exit 0.
 *
 * Sem análise de alias, indireção, call graph, classificação de autoridade,
 * atribuição de RPC, observabilidade ou modos extras. Se o comportamento não
 * puder ser explicado em 30 segundos lendo este arquivo, está fora de escopo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Diretórios de produção — dev-tools e "jinlong layout" ficam fora destes dirs.
const PROD_DIRS = [
  path.join(root, 'pdv-importados'),
  path.join(root, 'backend', 'supabase', 'functions'),
]

const CRITICAL_TABLES = ['caixas', 'movimentos_caixa', 'estoque', 'clientes', 'fornecedores']
const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete']

// ALLOWLIST estática — exceções explícitas (writes diretos já existentes).
// Apenas uma lista: relPath → tabelas permitidas naquele arquivo. Sem semântica.
// Comentário de fase é só para navegação humana; não afeta o comportamento.
const ALLOWLIST = {
  'pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts': ['caixas'], // Fase 1
  'backend/supabase/functions/sync-outbox/index.ts': ['caixas'], // Fase 1
  'pdv-importados/app/gerente/estoque/actions.ts': ['estoque'], // Fase 2
  'pdv-importados/lib/adapters/supabase/produtoRepository.ts': ['estoque'], // Fase 2
  'pdv-importados/app/gerente/produtos/actions.ts': ['estoque'], // Fase 2
  'pdv-importados/app/gerente/clientes/actions.ts': ['clientes'], // Fase 4
  'pdv-importados/app/gerente/financeiro/actions.ts': ['clientes'], // Fase 4
  'pdv-importados/app/gerente/fornecedores/actions.ts': ['fornecedores'], // Fase 4
}

/** Recursivamente coleta .ts/.tsx de produção. Exclui test/spec, e2e/, database.types.ts. */
function collectProdFiles(dirs) {
  const result = []
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'e2e' || e.name === 'node_modules') continue
        result.push(...collectProdFiles([full]))
      } else if (
        e.isFile() &&
        /\.(ts|tsx)$/.test(e.name) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(e.name) &&
        e.name !== 'database.types.ts'
      ) {
        result.push(full)
      }
    }
  }
  return result
}

const violations = []

for (const file of collectProdFiles(PROD_DIRS)) {
  const rel = path.relative(root, file).split(path.sep).join('/')
  const text = fs.readFileSync(file, 'utf8')
  const allowed = ALLOWLIST[rel] ?? []

  for (const table of CRITICAL_TABLES) {
    const re = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
      // Segmento a partir do `.from(...)` até o próximo `.from(` (ou +600 chars):
      // captura cadeias multi-linha do Supabase sem interpretar contexto.
      const start = m.index + m[0].length
      const nextFrom = text.indexOf('.from(', start)
      const end = nextFrom === -1 ? Math.min(text.length, start + 600) : nextFrom
      const segment = text.slice(start, end)
      const op = WRITE_METHODS.find((w) => segment.includes(`.${w}(`))
      if (!op) continue // `.select`-only ou leitura: ignora
      if (allowed.includes(table)) continue // exceção explícita
      const line = text.slice(0, m.index).split('\n').length
      violations.push(`${rel}:${line} — write direto \`${table}.${op}(...)\` não autorizado`)
    }
  }
}

if (violations.length > 0) {
  console.error('[authority-guard] FAIL — write direto em tabela crítica fora da allowlist:\n')
  for (const v of violations) console.error(`  - ${v}`)
  console.error(
    '\n  → Toda escrita em tabela crítica deve passar pela RPC/worker canônico do domínio.\n' +
      '    Se este write é legítimo e pré-existente, adicione o arquivo à ALLOWLIST em\n' +
      '    scripts/authority-guard.mjs. Tabelas críticas: ' + CRITICAL_TABLES.join(', ') + '.',
  )
  process.exit(1)
}

console.log('[authority-guard] OK — nenhum write direto não autorizado em tabela crítica.')
