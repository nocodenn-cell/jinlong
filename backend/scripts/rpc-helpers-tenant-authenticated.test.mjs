// Regressão da auditoria RPC SECURITY DEFINER (2026-10-28): helpers que revelavam dados de outra empresa
// não podem ser executados por `authenticated`. Aplica TODAS as migrations num PGlite com stubs do Supabase.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { applyAllMigrations } from './lib/pglite-full-schema.mjs'

let db
const HELPERS = [
  'public.fp_empresa_da_loja(uuid)',
  'public.fp_empresa_operacional(uuid)',
  'public.fp_pdv_config_id(uuid)',
  'public.fp_mesma_empresa(uuid, uuid)',
]

before(async () => {
  ;({ db } = await applyAllMigrations())
})

after(async () => {
  await db?.close?.()
})

for (const sig of HELPERS) {
  test(`${sig} não é executável por authenticated`, async () => {
    const r = await db.query(
      `select has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') as ok`,
      [sig],
    )
    assert.equal(r.rows[0].ok, false)
  })
}

test('fp_minha_assinatura continua executável por authenticated (usado pelo app)', async () => {
  const r = await db.query(
    `select has_function_privilege('authenticated', 'public.fp_minha_assinatura()'::regprocedure, 'EXECUTE') as ok`,
  )
  assert.equal(r.rows[0].ok, true)
})
