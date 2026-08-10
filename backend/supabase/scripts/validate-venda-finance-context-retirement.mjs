#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const REPO_ROOT = join(ROOT, '../..')
const MIGRATIONS = join(ROOT, 'migrations')
const RETIRED = join(MIGRATIONS, '20260808130200_24704_reapply_venda_finance_context_idempotent.sql')
const TOMBSTONE_NAME = '20260810222702_retire_obsolete_venda_finance_context.sql'
const TOMBSTONE = join(MIGRATIONS, TOMBSTONE_NAME)
const OBJECT_PATTERN = /venda_finance_context|sincronizar_finance_context_venda|trg_finance_context_(?:via_)?(?:pagamento|conta)|idx_venda_finance_context|venda_finance_context_select_loja/i

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (existsSync(RETIRED)) fail(`Migration aposentada ainda existe: ${RETIRED}`)
if (!existsSync(TOMBSTONE)) fail(`Tombstone ausente: ${TOMBSTONE}`)

const body = readFileSync(TOMBSTONE, 'utf8')
if (/\bCASCADE\b/i.test(body.replace(/^\s*--.*$/gm, ''))) fail('Tombstone não pode usar CASCADE')

const requiredInOrder = [
  'DROP TRIGGER IF EXISTS trg_finance_context_pagamento',
  'DROP TRIGGER IF EXISTS trg_finance_context_conta',
  'DROP FUNCTION IF EXISTS public.trg_finance_context_via_pagamento()',
  'DROP FUNCTION IF EXISTS public.trg_finance_context_via_conta()',
  'DROP FUNCTION IF EXISTS public.sincronizar_finance_context_venda(uuid)',
  'DROP TABLE IF EXISTS public.venda_finance_context',
]
let cursor = -1
for (const fragment of requiredInOrder) {
  const next = body.indexOf(fragment)
  if (next < 0 || next <= cursor) fail(`Objeto ausente ou fora de ordem na tombstone: ${fragment}`)
  cursor = next
}

const tombstoneVersion = Number(TOMBSTONE_NAME.match(/^(\d+)_/)[1])
const laterDependencies = []
for (const name of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'))) {
  const match = name.match(/^(\d+)_/)
  if (!match || Number(match[1]) <= tombstoneVersion) continue
  if (OBJECT_PATTERN.test(readFileSync(join(MIGRATIONS, name), 'utf8'))) laterDependencies.push(name)
}
if (laterDependencies.length) fail(`Migrations posteriores dependem dos objetos aposentados: ${laterDependencies.join(', ')}`)

execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'migration-sequence-guard.mjs')], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
})
console.log('Retirement validation OK')
