// Multiempresa Fase 5 — catálogo de produtos por EMPRESA (cliente 1 com filial) e transferência matriz→filial.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyAllMigrations } from './lib/pglite-full-schema.mjs'

const E2 = 'e0000002-0000-4000-8000-000000000002'
const LA = 'a0000001-0000-4000-8000-000000000001' // matriz (default de produtos.loja_id)
const LF = 'a0000009-0000-4000-8000-000000000009' // filial da Empresa 1
const LB = 'b0000001-0000-4000-8000-000000000001'
const PA = 'c5000001-0000-4000-8000-000000000001'
const PB = 'c5000002-0000-4000-8000-000000000002'
const PF = 'c5000003-0000-4000-8000-000000000003' // produto cadastrado na filial (modelo legado: catálogo por loja)
const U = {
  gerA: '50000000-0000-4000-8000-000000000001', gerF: '50000000-0000-4000-8000-000000000002',
  opF: '50000000-0000-4000-8000-000000000003', gerB: '50000000-0000-4000-8000-000000000004',
}
let pass = 0
const t = async (nome, fn) => {
  try { await fn(); pass++; console.log(`ok - ${nome}`) } catch (e) { console.error(`not ok - ${nome}\n  ${e.stack ?? e}`); process.exitCode = 1 }
}
const { db, failed } = await applyAllMigrations()
await t('migrations aplicam (inclui fase 5)', () => assert.deepEqual(failed, []))

await db.exec(`
  INSERT INTO public.empresas (id, nome) VALUES ('${E2}', 'Empresa B');
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES ('${LF}', 'Filial A', 'e0000001-0000-4000-8000-000000000001');
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES ('${LB}', 'Loja B', '${E2}');
  INSERT INTO auth.users (id) SELECT unnest(ARRAY['${Object.values(U).join("','")}']::uuid[]);
  INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
    ('${U.gerA}', 'Ger Matriz', 'GERENTE', '${LA}'), ('${U.gerF}', 'Ger Filial', 'GERENTE', '${LF}'),
    ('${U.opF}', 'Op Filial', 'OPERADOR', '${LF}'), ('${U.gerB}', 'Ger B', 'GERENTE', '${LB}');
  INSERT INTO public.produtos (id, nome, preco_varejo, origem, codigo_barras) VALUES ('${PA}', 'Prod catálogo A', 10, 'china_manual', '7895000000001');
  INSERT INTO public.produtos (id, nome, preco_varejo, origem, loja_id, codigo_barras) VALUES ('${PB}', 'Prod B', 20, 'china_manual', '${LB}', '7895000000002');
  INSERT INTO public.produtos (id, nome, preco_varejo, origem, loja_id, codigo_barras) VALUES ('${PF}', 'Prod filial', 15, 'china_manual', '${LF}', '7895000000003');
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual) VALUES ('${PF}', '${LF}', 8);
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual) VALUES ('${PA}', '${LA}', 50), ('${PA}', '${LF}', 10), ('${PB}', '${LB}', 5);
`).catch((e) => { console.error('semente falhou:', e.message); process.exit(1) })

async function como(uid, fn) {
  await db.exec('BEGIN')
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true),
      set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true),
      set_config('request.headers', '{}', true)`, [uid])
    await db.exec('SET LOCAL ROLE authenticated')
    return await fn()
  } finally { await db.exec('ROLLBACK') }
}
const q = (uid, sql, p) => como(uid, async () => (await db.query(sql, p)).rows)
const erro = (uid, sql, p) => como(uid, async () => { try { await db.query(sql, p); return null } catch (e) { return e.message } })

await t('produto da matriz tem loja_id = matriz (pré-condição do cliente 1)', async () => {
  assert.equal((await db.query(`SELECT loja_id FROM public.produtos WHERE id='${PA}'`)).rows[0].loja_id, LA)
})
// Obs.: a policy PERMISSIVE legada `produtos_select` (loja_id = auth_usuario_loja_id()) continua limitando o SELECT
// direto — comportamento anterior ao PR. A fase 5 corrige a guarda RESTRICTIVE e os envelopes de RPC.
const assertProd = (uid, id) => erro(uid, `SELECT public.fp_assert_produto($1, 't')`, [id])
const decr = (uid, id) => erro(uid, `SELECT * FROM public.decrementar_estoque_seguro(p_produto_id => $1, p_quantidade => 1, p_venda_id => NULL)`, [id])
await t('fp_assert_produto: filial passa no catálogo da empresa; Empresa B é negada', async () => {
  assert.equal(await assertProd(U.opF, PA), null)
  assert.match(await assertProd(U.opF, PB) ?? 'aceito', /ACESSO_LOJA_NEGADO/)
  assert.equal(await assertProd(U.gerB, PB), null)
  assert.match(await assertProd(U.gerB, PA) ?? 'aceito', /ACESSO_LOJA_NEGADO/)
})
await t('guarda RESTRICTIVE de produtos não barra a filial (catálogo por empresa)', async () => {
  const qual = (await db.query(`SELECT qual FROM pg_policies WHERE policyname='tenant_guard' AND tablename='produtos'`)).rows[0].qual
  assert.match(qual, /produto_empresa/)
})
await t('filial baixa estoque do produto do catálogo: envelope passa (decrementar_estoque_seguro)', async () => {
  const r = await como(U.opF, async () => (await db.query(`SELECT * FROM public.decrementar_estoque_seguro(p_produto_id => $1, p_quantidade => 1, p_venda_id => NULL)`, [PA])).rows)
  assert.notEqual(r[0]?.mensagem ?? '', 'ACESSO_LOJA_NEGADO')  // corpo original decide (aqui: sem venda)
})
await t('cross-empresa: decrementar produto da Empresa B é negado', async () => {
  assert.match(await erro(U.opF, `SELECT * FROM public.decrementar_estoque_seguro(p_produto_id => $1, p_quantidade => 1, p_venda_id => NULL)`, [PB]) ?? 'aceito', /ACESSO_LOJA_NEGADO/)
})
const transf = (uid, de, para, prod, k) => erro(uid,
  `SELECT public.transferir_estoque_seguro(p_loja_origem => $1, p_loja_destino => $2, p_produto_id => $3, p_quantidade => 1, p_idempotency_key => $4)`,
  [de, para, prod, k])
await t('gerente da matriz transfere matriz→filial (destino fora do seu escopo)', async () => {
  assert.equal(await transf(U.gerA, LA, LF, PA, 'f5-ok'), null)
})
await t('transferência para loja de outra empresa é negada', async () => {
  assert.match(await transf(U.gerA, LA, LB, PA, 'f5-x') ?? 'aceito', /ACESSO|EMPRESA/)
})
await t('fp_assert_loja: loja de outra empresa é negada; mesma empresa delega ao corpo original', async () => {
  assert.match(await erro(U.gerF, `SELECT public.fp_assert_loja($1, true, 't')`, [LB]) ?? 'aceito', /ACESSO_LOJA_NEGADO/)
  assert.equal(await erro(U.gerF, `SELECT public.fp_assert_loja($1, true, 't')`, [LA]), null)
  assert.match(await transf(U.gerB, LB, LA, PB, 'f5-z') ?? 'aceito', /ACESSO|EMPRESA/, 'Empresa B não transfere para a Empresa A')
})
await t('OPERADOR da filial: caminhos do PDV (catálogo eq loja_id, estoque, calcular_preco_produto, baixa)', async () => {
  const cat = await q(U.opF, `SELECT id FROM public.produtos WHERE loja_id = $1`, [LF]) // caixaCatalogo.impl.ts
  assert.deepEqual(cat.map((r) => r.id), [PF])
  const est = await q(U.opF, `SELECT quantidade_atual FROM public.estoque WHERE loja_id = $1 AND produto_id = $2`, [LF, PF])
  assert.equal(Number(est[0]?.quantidade_atual), 8)
  const preco = await erro(U.opF, `SELECT public.calcular_preco_produto(p_produto_id => $1, p_loja_id => $2, p_quantidade => 1)`, [PF, LF])
  assert.doesNotMatch(preco ?? '', /ACESSO_LOJA/, `preço: ${preco}`) // caixaPrecoProduto.impl.ts
  assert.equal(await assertProd(U.opF, PF), null)
  assert.notEqual((await como(U.opF, async () => (await db.query(`SELECT * FROM public.decrementar_estoque_seguro(p_produto_id => $1, p_quantidade => 1, p_venda_id => NULL)`, [PF])).rows))[0]?.mensagem, 'ACESSO_LOJA_NEGADO')
})
await t('Empresa B não lê nem opera produto/estoque da Empresa A (SELECT e RPC)', async () => {
  assert.equal((await q(U.gerB, `SELECT count(*)::int n FROM public.produtos WHERE id IN ($1, $2)`, [PA, PF]))[0].n, 0)
  assert.equal((await q(U.gerB, `SELECT count(*)::int n FROM public.estoque WHERE loja_id IN ($1, $2)`, [LA, LF]))[0].n, 0)
  assert.match(await decr(U.gerB, PF) ?? 'aceito', /ACESSO_LOJA_NEGADO/)
})
await t('usuário INATIVO: corpo original recusa na própria empresa; outra empresa segue negada no envelope', async () => {
  await db.exec(`UPDATE public.usuarios SET ativo = false WHERE id = '${U.gerB}'`)
  try {
    assert.match(await assertProd(U.gerB, PF) ?? 'aceito', /ACESSO_LOJA_NEGADO/)
    assert.match(await erro(U.gerB, `SELECT public.fp_assert_loja($1, true, 't')`, [LA]) ?? 'aceito', /ACESSO_LOJA_NEGADO/)
    assert.equal(await erro(U.gerB, `SELECT public.fp_assert_loja($1, true, 't')`, [LB]), null)
  } finally { await db.exec(`UPDATE public.usuarios SET ativo = true WHERE id = '${U.gerB}'`) }
})
await t('rollback da fase 4 se recusa com a fase 5 instalada; rollback 5 restaura e reaplica', async () => {
  const rd = (f) => readFile(new URL(f, import.meta.url), 'utf8')
  await assert.rejects(db.exec(await rd('../supabase/rollback/20261019160000_multiempresa_fase4_desempenho_guardas.rollback.sql')), /rollback da fase 5/)
  await db.exec('ROLLBACK').catch(() => {})
  await db.exec(await rd('../supabase/rollback/20261019170000_multiempresa_fase5_catalogo_empresa.rollback.sql'))
  const qual = (await db.query(`SELECT qual FROM pg_policies WHERE policyname='tenant_guard' AND tablename='produtos'`)).rows[0].qual
  assert.doesNotMatch(qual, /produto_empresa/)
  assert.match(await decr(U.opF, PA) ?? 'aceito', /ACESSO_LOJA_NEGADO/, 'sem fase 5 a filial não baixa estoque (regressão reproduzida)')
  await db.exec(await rd('../supabase/migrations/20261019170000_multiempresa_fase5_catalogo_empresa.sql'))
  assert.equal(await decr(U.opF, PA), null)
})
console.log(`\n${pass} testes ok${process.exitCode ? ' — HÁ FALHAS' : ''}`)
