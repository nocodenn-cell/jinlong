// PDV · Troca Segura de Operador (F3) sobre o ESQUEMA REAL (todas as migrations em PGlite).
// Gaveta do turno: responsável = caixas.operador_id; operador ativo = caixa_operadores; regra única no servidor.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyAllMigrations } from './lib/pglite-full-schema.mjs'

const E2 = 'e0000002-0000-4000-8000-000000000002'
const LA = 'a0000001-0000-4000-8000-000000000001' // MATRIZ semeada pelas migrations
const LB = 'b0000001-0000-4000-8000-000000000001'
const U = {
  resp: '30000000-0000-4000-8000-000000000001', opB: '30000000-0000-4000-8000-000000000002',
  opC: '30000000-0000-4000-8000-000000000003', ger: '30000000-0000-4000-8000-000000000004',
  opD: '30000000-0000-4000-8000-000000000005', legado: '30000000-0000-4000-8000-000000000006',
  fora: '30000000-0000-4000-8000-000000000007',
}
const C1 = 'c3000000-0000-4000-8000-000000000001' // turno do responsável
const C2 = 'c3000000-0000-4000-8000-000000000002' // caixa próprio de opD
const C3 = 'c3000000-0000-4000-8000-000000000003' // caixa legado, nunca trocado

let pass = 0
const t = async (nome, fn) => {
  try { await fn(); pass++; console.log(`ok - ${nome}`) } catch (e) { console.error(`not ok - ${nome}\n  ${e.stack ?? e}`); process.exitCode = 1 }
}

const { db, failed } = await applyAllMigrations()
await t('todas as migrations aplicam (inclui 20261023200000)', () => {
  const nossa = failed.filter((f) => f.file.startsWith('20261023200000'))
  assert.deepEqual(nossa, [], JSON.stringify(nossa))
})

await db.exec(`
  INSERT INTO public.empresas (id, nome) VALUES ('${E2}', 'Empresa Fora') ON CONFLICT DO NOTHING;
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES ('${LB}', 'Loja Fora', '${E2}') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id) SELECT unnest(ARRAY['${Object.values(U).join("','")}']::uuid[]);
  INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
    ('${U.resp}', 'Ana Responsável', 'OPERADOR', '${LA}', true), ('${U.opB}', 'Bruno', 'OPERADOR', '${LA}', true),
    ('${U.opC}', 'Carla', 'OPERADOR', '${LA}', true), ('${U.ger}', 'Gil Gerente', 'GERENTE', '${LA}', true),
    ('${U.opD}', 'Davi', 'OPERADOR', '${LA}', true), ('${U.legado}', 'Leo', 'OPERADOR', '${LA}', true),
    ('${U.fora}', 'Fora', 'OPERADOR', '${LB}', true);
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
  SELECT u.id, l.empresa_id, l.id, CASE WHEN u.perfil = 'GERENTE' THEN 'GERENTE' ELSE 'OPERADOR' END
    FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id
   WHERE u.id IN ('${Object.values(U).join("','")}')
     AND NOT EXISTS (SELECT 1 FROM public.usuario_vinculos v WHERE v.usuario_id = u.id AND v.ativo);
  INSERT INTO public.caixas (id, loja_id, operador_id, valor_inicial, saldo_atual, status) VALUES
    ('${C1}', '${LA}', '${U.resp}', 100, 100, 'ABERTO'),
    ('${C2}', '${LA}', '${U.opD}', 50, 50, 'ABERTO'),
    ('${C3}', '${LA}', '${U.legado}', 10, 10, 'ABERTO');
`).catch((e) => { console.error('semente falhou:', e.message); process.exit(1) })

async function como(uid, sql, params = []) {
  await db.exec('BEGIN')
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true),
      set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [uid])
    await db.exec('SET LOCAL ROLE authenticated')
    const r = await db.query(sql, params)
    await db.exec('COMMIT')
    return r.rows
  } catch (e) {
    await db.exec('ROLLBACK')
    throw e
  }
}
async function servico(sql, params = []) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE service_role')
    const r = await db.query(sql, params)
    await db.exec('COMMIT')
    return r.rows
  } catch (e) {
    await db.exec('ROLLBACK')
    throw e
  }
}
const ctx = async (uid) => (await como(uid, 'SELECT public.pdv_troca_contexto() AS c'))[0].c
const status = async (uid) => (await como(uid, `SELECT status, caixa_id FROM public.obter_status_caixa_operador($1::uuid)`, [uid]))[0]
// Só a guarda de operador interessa: a venda de teste falha DEPOIS dela (itens vazios) quando o operador é aceito.
const vender = (uid, caixa) => como(uid, `SELECT * FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id => gen_random_uuid(), p_caixa_id => $1::uuid, p_operador_id => $2::uuid, p_loja_id => $3::uuid,
    p_forma_pagamento => 'DINHEIRO', p_total_bruto => 10, p_total_desconto => 0, p_total_liquido => 10,
    p_pagamentos => '[{"forma_pagamento":"DINHEIRO","valor":10}]'::jsonb, p_itens => '[]'::jsonb)`, [caixa, uid, LA])
const OPERADOR_RECUSADO = /CAIXA_OPERADOR_INVALIDO/
async function guardaAceita(uid, caixa) {
  try { await vender(uid, caixa) } catch (e) {
    assert.doesNotMatch(String(e.message), OPERADOR_RECUSADO, `guarda recusou ${uid}: ${e.message}`)
    return
  }
}
const movimentar = (uid, caixa) => como(uid, `SELECT public.registrar_movimentacao(
    p_caixa_id => $1::uuid, p_tipo => 'suprimento', p_forma_pagamento => 'dinheiro', p_valor => 5,
    p_motivo => 'teste troca', p_idempotency_key => gen_random_uuid()::text)`, [caixa])

await t('regra única aplicada nas RPCs existentes (v4, movimentação, status)', async () => {
  const r = await db.query(`SELECT p.proname, n.nspname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN ('finalizar_venda_transacional_canonica_v4', 'registrar_movimentacao', 'obter_status_caixa_operador')
      AND n.nspname IN ('public', 'internal') AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')`)
  for (const nome of ['finalizar_venda_transacional_canonica_v4', 'registrar_movimentacao', 'obter_status_caixa_operador']) {
    const corpos = r.rows.filter((x) => x.proname === nome)
    assert.ok(corpos.length > 0, `${nome} sem corpo plpgsql`)
    assert.ok(corpos.some((x) => x.prosrc.includes('fp_operador_ativo_caixa')), `${nome} sem a regra`)
  }
})

await t('legado: caixa nunca trocado segue com o responsável (sem regressão)', async () => {
  assert.equal((await status(U.legado)).caixa_id, C3)
  await guardaAceita(U.legado, C3)
  await assert.rejects(vender(U.opB, C3), OPERADOR_RECUSADO)
  const c = await ctx(U.legado)
  assert.equal(c.operando.caixa_id, C3)
  assert.equal(c.proprio_em_uso, null)
})

await t('sem liberação, colega não assume o turno de outro', async () => {
  await assert.rejects(como(U.opB, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1]), /TROCA_CAIXA_EM_USO/)
  await assert.rejects(como(U.opB, 'SELECT public.liberar_caixa_operador($1::uuid)', [C1]), /TROCA_NAO_E_OPERADOR_ATIVO/)
})

await t('responsável libera: turno continua ABERTO e ninguém opera', async () => {
  await como(U.resp, 'SELECT public.liberar_caixa_operador($1::uuid)', [C1])
  assert.equal((await db.query(`SELECT status FROM public.caixas WHERE id = '${C1}'`)).rows[0].status, 'ABERTO')
  await assert.rejects(vender(U.resp, C1), OPERADOR_RECUSADO)
  await assert.rejects(movimentar(U.resp, C1), /MOV_CAIXA_SEM_PERMISSAO/)
  assert.equal((await status(U.resp)).status, 'FECHADO')
  const c = await ctx(U.opB)
  assert.deepEqual(c.liberados.map((x) => x.caixa_id), [C1])
  assert.equal(c.liberados[0].responsavel_nome, 'Ana Responsável')
})

await t('B assume com a própria sessão; substituído não opera; vendedor/responsável preservados', async () => {
  await como(U.opB, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1])
  await como(U.opB, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1]) // idempotente
  assert.equal((await status(U.opB)).caixa_id, C1)
  await guardaAceita(U.opB, C1)
  await assert.rejects(vender(U.resp, C1), OPERADOR_RECUSADO)
  await movimentar(U.opB, C1).catch((e) => assert.doesNotMatch(String(e.message), /MOV_CAIXA_SEM_PERMISSAO/))
  assert.equal((await db.query(`SELECT operador_id FROM public.caixas WHERE id = '${C1}'`)).rows[0].operador_id, U.resp)
  const a = await ctx(U.resp)
  assert.equal(a.proprio_em_uso.operador_nome, 'Bruno')
  assert.equal(a.operando, null)
})

await t('concorrência: terceiro não assume caixa em uso; ninguém fica ativo em dois caixas', async () => {
  await assert.rejects(como(U.opC, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1]), /TROCA_CAIXA_EM_USO/)
  await assert.rejects(
    db.query(`INSERT INTO public.caixa_operadores (caixa_id, loja_id, usuario_id) VALUES ('${C1}', '${LA}', '${U.opC}')`),
    /duplicate key|unique/)
})

await t('bloqueio de tela: bloqueado não vende; só o servidor (service_role) desbloqueia', async () => {
  const [{ c }] = await como(U.opB, `SELECT public.bloquear_caixa_operador('INATIVIDADE') AS c`)
  assert.equal(c, C1)
  await assert.rejects(vender(U.opB, C1), OPERADOR_RECUSADO)
  assert.equal((await ctx(U.opB)).bloqueado.caixa_id, C1)
  await assert.rejects(como(U.opB, 'SELECT public.desbloquear_caixa_operador($1::uuid)', [U.opB]), /permission denied/)
  await assert.rejects(como(U.opB, 'SELECT public.liberar_caixa_operador($1::uuid)', [C1]), /TROCA_NAO_E_OPERADOR_ATIVO/)
  assert.equal((await servico('SELECT public.desbloquear_caixa_operador($1::uuid) AS c', [U.opB]))[0].c, C1)
  await guardaAceita(U.opB, C1)
})

await t('isolamento: usuário de outra empresa não vê nem assume', async () => {
  await assert.rejects(como(U.fora, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1]), /TROCA_CAIXA_NAO_ENCONTRADO/)
  const c = await ctx(U.fora)
  assert.deepEqual(c.liberados, [])
  assert.deepEqual(await como(U.fora, `SELECT id FROM public.caixa_operadores`), [])
})

await t('gerente assume caixa em uso (forçado) e o evento fica na trilha', async () => {
  await como(U.ger, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1])
  await assert.rejects(vender(U.opB, C1), OPERADOR_RECUSADO)
  const ev = await db.query(`SELECT detalhe FROM public.pdv_operador_eventos
    WHERE usuario_id = '${U.ger}' AND tipo = 'ENTROU' ORDER BY recebido_em DESC LIMIT 1`)
  assert.equal(ev.rows[0].detalhe.forcado, true)
  assert.equal(ev.rows[0].detalhe.anterior, U.opB)
  const fim = await db.query(`SELECT motivo_fim FROM public.caixa_operadores WHERE caixa_id = '${C1}' AND usuario_id = '${U.opB}'`)
  assert.equal(fim.rows[0].motivo_fim, 'ASSUMIDO_GERENTE')
})

await t('quem tem outro caixa aberto não assume caixa liberado', async () => {
  await como(U.ger, 'SELECT public.liberar_caixa_operador($1::uuid)', [C1])
  await assert.rejects(como(U.opD, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1]), /TROCA_OPERADOR_COM_OUTRO_CAIXA/)
})

await t('fechamento: quem fecha é o operador ativo; responsável preservado; fechar encerra a linha ativa', async () => {
  await como(U.opC, 'SELECT public.assumir_caixa_operador($1::uuid)', [C1])
  await assert.rejects(
    como(U.resp, `SELECT * FROM public.fechar_caixa_atomico($1::uuid, 100, 'teste troca')`, [U.resp]),
    /CAIXA_NAO_ENCONTRADO/)
  const [f] = await como(U.opC, `SELECT * FROM public.fechar_caixa_atomico($1::uuid, 100, 'teste troca')`, [U.opC])
  assert.equal(f.o_caixa_id, C1)
  const cx = (await db.query(`SELECT status, operador_id FROM public.caixas WHERE id = '${C1}'`)).rows[0]
  assert.deepEqual([cx.status, cx.operador_id], ['FECHADO', U.resp])
  const ativas = await db.query(`SELECT count(*)::int n FROM public.caixa_operadores WHERE caixa_id = '${C1}' AND fim IS NULL`)
  assert.equal(ativas.rows[0].n, 0)
  const ult = await db.query(`SELECT usuario_id, motivo_fim FROM public.caixa_operadores WHERE caixa_id = '${C1}' ORDER BY inicio DESC LIMIT 1`)
  assert.deepEqual([ult.rows[0].usuario_id, ult.rows[0].motivo_fim], [U.opC, 'FECHAMENTO'])
  const [rep] = await como(U.opC, `SELECT * FROM public.fechar_caixa_atomico($1::uuid, 100, 'teste troca')`, [U.opC])
  assert.equal(rep.o_ja_fechado, true)
})

await t('leitura do turno: participante vê caixa e vendas do turno; outro operador da loja não', async () => {
  assert.equal((await como(U.opB, `SELECT id FROM public.caixas WHERE id = '${C1}'`)).length, 1)
  assert.equal((await como(U.opD, `SELECT id FROM public.caixas WHERE id = '${C1}'`)).length, 0)
})

await t('trilha: SAIU/ENTROU de cada troca com caixa_id', async () => {
  const r = await db.query(`SELECT tipo, count(*)::int n FROM public.pdv_operador_eventos
    WHERE detalhe->>'caixa_id' = '${C1}' GROUP BY tipo ORDER BY tipo`)
  const m = Object.fromEntries(r.rows.map((x) => [x.tipo, x.n]))
  assert.ok(m.SAIU >= 3 && m.ENTROU >= 4 && m.BLOQUEIO_AUTO === 1, JSON.stringify(m))
})

await t('multiempresa: tabela com tenant_guard e RPCs revisadas', async () => {
  const g = await db.query(`SELECT polpermissive FROM pg_policy WHERE polname = 'tenant_guard'
    AND polrelid = 'public.caixa_operadores'::regclass`)
  assert.equal(g.rows[0]?.polpermissive, false)
  const r = await db.query(`SELECT p.proname, coalesce(obj_description(p.oid, 'pg_proc'), '') c FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('liberar_caixa_operador', 'assumir_caixa_operador', 'bloquear_caixa_operador', 'pdv_troca_contexto')`)
  assert.equal(r.rows.length, 4)
  for (const x of r.rows) assert.match(x.c, /^Multiempresa revisado/, x.proname)
  const exposta = await db.query(`SELECT has_function_privilege('authenticated', 'public.desbloquear_caixa_operador(uuid)', 'EXECUTE') e`)
  assert.equal(exposta.rows[0].e, false)
})

await t('rollback devolve a regra antiga e remove os objetos', async () => {
  const sql = await readFile(new URL('../supabase/rollback/20261023200000_pdv_troca_operador_caixa.rollback.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  const r = await db.query(`SELECT count(*)::int n FROM pg_proc WHERE prosrc LIKE '%fp_operador_ativo_caixa%'`)
  assert.equal(r.rows[0].n, 0)
  assert.equal((await db.query(`SELECT to_regclass('public.caixa_operadores') r`)).rows[0].r, null)
  assert.equal((await status(U.legado)).caixa_id, C3)
})

console.log(`\n${pass} testes ok${process.exitCode ? ' — HÁ FALHAS' : ''}`)
