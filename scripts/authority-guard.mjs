#!/usr/bin/env node
/**
 * AUTHORITY GUARD — containment de writes diretos em tabelas críticas.
 *
 * Modelo (recovery Opção B): snapshot do estado ATUAL do código.
 * A ALLOWLIST congela writes diretos legítimos já existentes; qualquer
 * write novo em tabela crítica fora da lista quebra o CI.
 *
 * Escopo do detector:
 *   1. Detecção LITERAL: `.from('<tabela crítica>')` seguido de
 *      `.insert(` / `.update(` / `.upsert(` / `.delete(`.
 *   2. ALLOWLIST estática por arquivo (snapshot recovery).
 *   3. Enforcement binário: exit 1 se write direto não autorizado.
 *
 * Sem análise de alias, indireção, call graph ou SQL. Ver docs/WRITE_PATHS_MAP.md
 * (documentação humana; não lida pelo CI).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const PROD_DIRS = [
  path.join(root, 'pdv-importados'),
  path.join(root, 'backend', 'supabase', 'functions'),
]

const CRITICAL_TABLES = ['caixas', 'movimentos_caixa', 'estoque', 'clientes', 'fornecedores']
const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete']

// Snapshot recovery/consolidacao — writes diretos legítimos hoje.
// Ao migrar um domínio para RPC-only, remova a entrada e o write correspondente.
const ALLOWLIST = {
  'pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts': ['caixas'],
  'backend/supabase/functions/sync-outbox/index.ts': ['caixas'],
  'pdv-importados/lib/adapters/supabase/produtoRepository.ts': ['estoque'],
  'pdv-importados/app/gerente/estoque/actions.ts': ['estoque'],
  'pdv-importados/app/gerente/produtos/actions.ts': ['estoque'],
  'pdv-importados/app/gerente/clientes/actions.ts': ['clientes'],
  'pdv-importados/app/gerente/financeiro/actions.ts': ['clientes'],
  'pdv-importados/app/gerente/fornecedores/actions.ts': ['fornecedores'],
}

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
      const start = m.index + m[0].length
      const nextFrom = text.indexOf('.from(', start)
      const end = nextFrom === -1 ? Math.min(text.length, start + 600) : nextFrom
      const segment = text.slice(start, end)
      const op = WRITE_METHODS.find((w) => segment.includes(`.${w}(`))
      if (!op) continue
      if (allowed.includes(table)) continue
      const line = text.slice(0, m.index).split('\n').length
      violations.push(`${rel}:${line} — write direto \`${table}.${op}(...)\` não autorizado`)
    }
  }
}

if (violations.length > 0) {
  console.error('[authority-guard] FAIL — write direto em tabela crítica fora da allowlist:\n')
  for (const v of violations) console.error(`  - ${v}`)
  console.error(
    '\n  → Novos writes diretos em tabelas críticas devem passar por RPC/worker canônico.\n' +
      '    Se este write é legítimo e pré-existente, atualize ALLOWLIST e docs/WRITE_PATHS_MAP.md.\n' +
      '    Tabelas críticas: ' + CRITICAL_TABLES.join(', ') + '.',
  )
  process.exit(1)
}

console.log('[authority-guard] OK — nenhum write direto não autorizado em tabela crítica.')
