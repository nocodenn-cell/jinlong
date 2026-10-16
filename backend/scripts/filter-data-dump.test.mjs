// Testes do filtro do restore drill: bloco fora da allowlist sai inteiro;
// COPY de tabela permitida é projetado nas colunas do destino; auth ausente é pulado.
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
  'COPY "auth"."identities" (id, user_id) FROM stdin;',
  'i1\ta1',
  '\\.',
  'COPY "storage"."objects" (id, name) FROM stdin;',
  'o1\tfoto.png',
  '\\.',
].join('\n')

test('sem colunas de destino, só remove blocos fora da allowlist', () => {
  const { text, skipped, dropped, missingTables } = filterDump(DUMP, ALLOW, null)
  assert.equal(skipped, 1)
  assert.deepEqual(dropped, [])
  assert.deepEqual(missingTables, [])
  assert.ok(!text.includes('storage'))
  assert.ok(text.includes('COPY "auth"."users" (id, email, email_confirmed_at, raw_user_meta_data)'))
})

test('projeta auth.users nas colunas do destino e registra a coluna ausente', () => {
  const target = parseTargetColumns(['auth.users.id', 'auth.users.email', 'auth.users.raw_user_meta_data', 'auth.identities.id', 'auth.identities.user_id', 'public.usuarios.id', 'public.usuarios.nome'].join('\n'))
  const { text, dropped } = filterDump(DUMP, ALLOW, target)
  assert.deepEqual(dropped, ['auth.users.email_confirmed_at'])
  assert.ok(text.includes('COPY "auth"."users" ("id", "email", "raw_user_meta_data") FROM stdin;'))
  assert.ok(text.includes('a1\tana@x.com\t{"nome":"Ana"}'))
  assert.ok(text.includes('a2\tbeto@x.com\t\\N'))
})

test('tabela auth ausente no destino é pulada e não aborta o restore', () => {
  const target = parseTargetColumns(['auth.users.id', 'auth.users.email', 'public.usuarios.id'].join('\n'))
  const { text, missingTables, skipped } = filterDump(DUMP, ALLOW, target)
  assert.deepEqual(missingTables, ['auth.identities'])
  assert.equal(skipped, 2)
  assert.ok(!text.includes('auth"."identities'))
  assert.ok(!text.includes('i1\ta1'))
})

test('tabela public com todas as colunas presentes sai como COPY projetado idêntico', () => {
  const target = parseTargetColumns('public.usuarios.id\npublic.usuarios.nome')
  const { text, dropped } = filterDump(DUMP, ALLOW, target)
  assert.deepEqual(dropped.filter((d) => d.startsWith('public.')), [])
  assert.ok(text.includes('COPY "public"."usuarios" ("id", "nome") FROM stdin;\nu1\tAna\nu2\tBeto\\N\n\\.'))
})

