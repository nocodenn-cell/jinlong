// Multiempresa Fase 4 — guardas sem chamada SECURITY DEFINER por linha (mesma semântica; isolamento coberto pelas fases 1–3).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyAllMigrations } from './lib/pglite-full-schema.mjs'

let pass = 0
const t = async (nome, fn) => {
  try { await fn(); pass++; console.log(`ok - ${nome}`) } catch (e) { console.error(`not ok - ${nome}\n  ${e.stack ?? e}`); process.exitCode = 1 }
}
const { db, failed } = await applyAllMigrations()
const lentas = async () => (await db.query(`
  SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='tenant_guard'
   AND regexp_replace(coalesce(qual,'')||' '||coalesce(with_check,''), 'fp_pode_loja_nula\\(NULL::uuid\\)', '', 'g') ~ 'fp_pode_(loja|loja_nula|empresa)\\('`)).rows.map((r) => r.tablename)

await t('migrations aplicam', () => assert.deepEqual(failed, []))
await t('todas as guardas otimizadas (nenhuma fp_pode_* por linha)', async () => {
  assert.deepEqual((await db.query(`SELECT tabela FROM internal.fp_guardas_originais WHERE NOT aplicada`)).rows, [])
  assert.deepEqual(await lentas(), [])
  const n = (await db.query(`SELECT count(*)::int n FROM internal.fp_guardas_originais`)).rows[0].n
  assert.ok(n >= 75, `guardas: ${n}`)
})
await t('vendas/itens/pagamentos usam views fp_guarda (sem fp_loja_de plpgsql)', async () => {
  const r = (await db.query(`SELECT tablename, qual FROM pg_policies WHERE policyname='tenant_guard' AND tablename IN ('vendas','vendas_pagamentos','historico_precos_produto')`)).rows
  for (const x of r) { assert.match(x.qual, /fp_guarda\.(caixa|venda|produto)/, x.tablename); assert.doesNotMatch(x.qual, /fp_loja_de/, x.tablename) }
})
await t('caixa/venda/itens usam semi-join hash (fp_guarda) sem subconsulta correlacionada', async () => {
  const q = async (tb) => (await db.query(`SELECT qual FROM pg_policies WHERE policyname='tenant_guard' AND tablename=$1`, [tb])).rows[0].qual
  assert.match(await q('vendas'), /caixa_id IN \( SELECT fpv\.id\s+FROM fp_guarda\.caixa fpv/)
  assert.match(await q('vendas_pagamentos'), /venda_id IN \( SELECT fpv\.id\s+FROM fp_guarda\.venda fpv/)
  const iv = await q('itens_venda')
  assert.match(iv, /venda_id IN \( SELECT fpv\.id\s+FROM fp_guarda\.venda fpv/)
  assert.doesNotMatch(iv, /fp_pode_loja_nula/, 'itens_venda mantém a semântica estrita (sem loja nula)')
})
await t('fp_guarda_rapida: padrões conhecidos', async () => {
  const f = async (e) => (await db.query(`SELECT internal.fp_guarda_rapida('t', $1) r`, [e])).rows[0].r
  assert.match(await f('fp_pode_loja(loja_id, NULL::text[])'), /^\(COALESCE\(loja_id = ANY/)
  assert.match(await f('fp_pode_loja_nula((loja_id)::uuid)'), /fp_pode_loja_nula\(NULL::uuid\)/)
  assert.match(await f('fp_pode_empresa(empresa_id)'), /fp_empresas_arr/)
})
await t('reaplicar a migration é idempotente e preserva a expressão ORIGINAL', async () => {
  const mig = await readFile(new URL('../supabase/migrations/20261019160000_multiempresa_fase4_desempenho_guardas.sql', import.meta.url), 'utf8')
  const antes = (await db.query(`SELECT qual FROM internal.fp_guardas_originais WHERE tabela='vendas'`)).rows[0].qual
  await db.exec(mig)
  const depois = (await db.query(`SELECT qual FROM internal.fp_guardas_originais WHERE tabela='vendas'`)).rows[0].qual
  assert.equal(depois, antes)
  assert.match(antes, /fp_pode_loja_nula\(fp_loja_de/, 'original guardado é a forma da fase 2')
})
await t('guarda criada depois por fp_aplicar_guarda já nasce otimizada (e o rollback a desfaz)', async () => {
  await db.exec(`CREATE TABLE public.fp_t_nova (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid)`)
  await db.query(`SELECT internal.fp_aplicar_guarda('fp_t_nova', 'L', 'public.fp_pode_loja(loja_id::uuid, NULL)', 'loja_id')`)
  const q = (await db.query(`SELECT qual FROM pg_policies WHERE tablename='fp_t_nova' AND policyname='tenant_guard'`)).rows[0].qual
  assert.match(q, /fp_lojas_permitidas_arr/)
  assert.ok(!(await lentas()).includes('fp_t_nova'))
})
await t('rollback das fases 3/2 se recusa a rodar com a fase 4 instalada', async () => {
  for (const f of ['20261019150000_multiempresa_fase3_config', '20261019140000_multiempresa_fase2_guardas']) {
    const rb = await readFile(new URL(`../supabase/rollback/${f}.rollback.sql`, import.meta.url), 'utf8')
    await assert.rejects(db.exec(rb), /rollback da fase 4/)
    await db.exec('ROLLBACK').catch(() => {})
  }
  assert.ok((await db.query(`SELECT to_regclass('internal.fp_guardas_originais') r`)).rows[0].r)
})
await t('rollback restaura as guardas originais e a migration reaplica', async () => {
  const rb = await readFile(new URL('../supabase/rollback/20261019160000_multiempresa_fase4_desempenho_guardas.rollback.sql', import.meta.url), 'utf8')
  const mig = await readFile(new URL('../supabase/migrations/20261019160000_multiempresa_fase4_desempenho_guardas.sql', import.meta.url), 'utf8')
  await db.exec(rb)
  assert.ok((await lentas()).length >= 70)
  assert.ok((await lentas()).includes('fp_t_nova'), 'guarda criada depois também volta à forma original')
  const def = (await db.query(`SELECT prosrc FROM pg_proc WHERE proname='fp_aplicar_guarda'`)).rows[0].prosrc
  assert.doesNotMatch(def, /fp_otimizar_guarda/, 'fp_aplicar_guarda restaurada')
  assert.equal((await db.query(`SELECT count(*)::int n FROM pg_namespace WHERE nspname='fp_guarda'`)).rows[0].n, 0)
  await db.exec(mig)
  assert.deepEqual(await lentas(), [])
})
console.log(`\n${pass} testes ok${process.exitCode ? ' — HÁ FALHAS' : ''}`)
