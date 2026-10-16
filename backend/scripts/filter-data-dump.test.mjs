// Testes do filtro do restore drill: bloco fora da allowlist sai inteiro;
// COPY de tabela permitida é projetado nas colunas que o destino tem.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterDump, parseTargetColumns } from './filter-data-dump.mjs'

const ALLOW = /^(public\.[a-z0-9_]+|auth\.(users|identities))$/

const DUMP = [
  'COPY "public"."usuarios" (id, nome) FROM stdin;',
  'u1\tAna',
  'u2\tBeto\\N',
  '\\.',
  'COPY "auth"."users" (id, email, email_confirmed_at, raw_user_meta_data) FROM stdin;',
  'a1\tana@x.com\t2026-10-01 10:00:00+00\t{"nome":"Ana"}',
  'a2\tbeto@x.com\t\\N\t\\N',
  '\\.',
  'COPY "storage"."objects" (id, name) FROM stdin;',
  'o1\tfoto.png',
  '\\.',
].join('\n')

test('sem colunas de destino, só remove blocos fora da allowlist', () => {
  const { text, skipped, dropped } = filterDump(DUMP, ALLOW, null)
  assert.equal(skipped, 1)
  assert.deepEqual(dropped, [])
  assert.ok(!text.includes('storage'))
  assert.ok(text.includes('COPY "auth"."users" (id, email, email_confirmed_at, raw_user_meta_data)'))
})

test('com colunas de destino, projeta auth.users e remove a coluna ausente dos valores', () => {
  const target = parseTargetColumns(['auth.users.id', 'auth.users.email', 'auth.users.raw_user_meta_data', 'public.usuarios.id', 'public.usuarios.nome'].join('\n'))
  const { text, dropped } = filterDump(DUMP, ALLOW, target)
  assert.deepEqual(dropped, ['auth.users.email_confirmed_at'])
  assert.ok(text.includes('COPY "auth"."users" ("id", "email", "raw_user_meta_data") FROM stdin;'))
  assert.ok(text.includes('a1\tana@x.com\t{"nome":"Ana"}'))
  assert.ok(text.includes('a2\tbeto@x.com\t\\N'))
})

test('tabela permitida sem projeção (todas as colunas existem) fica idêntica', () => {
  const target = parseTargetColumns('public.usuarios.id\npublic.usuarios.nome')
  const { text, dropped } = filterDump(DUMP, ALLOW, target)
  assert.deepEqual(dropped.filter((d) => d.startsWith('public.')), [])
  assert.ok(text.includes('COPY "public"."usuarios" ("id", "nome") FROM stdin;\nu1\tAna\nu2\tBeto\\N\n\\.'))
})
