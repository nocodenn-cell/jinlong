import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(HERE, '../supabase/migrations')
const ENABLED = /^\d+_.*\.sql$/
const AFTER_PARTIAL = '20260818000001'
const DROP_3ARGS =
  /DROP FUNCTION IF EXISTS public\.relatorio_consistencia_vendas\(\s*uuid\s*,\s*timestamptz\s*,\s*timestamptz\s*\)/i
const REVOKE_4ARGS_PUBLIC =
  /REVOKE EXECUTE ON FUNCTION public\.relatorio_consistencia_vendas\(\s*uuid\s*,\s*uuid\s*,\s*timestamptz\s*,\s*timestamptz\s*\)[\s\S]{0,80}PUBLIC/i
const REVOKE_VERIFICAR_PUBLIC =
  /REVOKE EXECUTE ON FUNCTION public\.verificar_consistencia_venda\(\s*uuid\s*\)[\s\S]{0,80}PUBLIC/i

function enabledAfterPartial() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => ENABLED.test(name) && name > AFTER_PARTIAL)
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))
}

function combinedLockdownSql() {
  return enabledAfterPartial()
    .map((file) => file.sql)
    .join('\n')
}

test('lockdown posterior à 20260818000001 remove a sobrecarga de 3 args', () => {
  assert.match(combinedLockdownSql(), DROP_3ARGS)
})

test('lockdown revoga EXECUTE da sobrecarga de 4 args de PUBLIC', () => {
  assert.match(combinedLockdownSql(), REVOKE_4ARGS_PUBLIC)
})

test('lockdown revoga EXECUTE de verificar_consistencia_venda de PUBLIC', () => {
  assert.match(combinedLockdownSql(), REVOKE_VERIFICAR_PUBLIC)
})

test('GATE9 não revoga o privilégio que deveria acusar', () => {
  const sql = readFileSync(join(HERE, 'financial-adversarial-gates.test.sql'), 'utf8')
  const start = sql.indexOf('GATE 9')
  const end = sql.indexOf('GATE 10')
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const gate9 = sql.slice(start, end)
  assert.doesNotMatch(sql, /GARANTIR AMBIENTE LIMPO PARA O GATE9/)
  assert.doesNotMatch(gate9, /REVOKE EXECUTE ON FUNCTION public\.relatorio_consistencia_vendas/)
  assert.match(gate9, /GATE9_OVERLOAD_3ARGS_AINDA_EXISTE/)
})
