// Multiempresa Fase 3 — configuração por empresa, RPCs revisadas e seleção de empresa (A×B, esquema real).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyAllMigrations } from './lib/pglite-full-schema.mjs'

const E1 = 'e0000001-0000-4000-8000-000000000001'
const E2 = 'e0000002-0000-4000-8000-000000000002'
const LA = 'a0000001-0000-4000-8000-000000000001'
const LB = 'b0000001-0000-4000-8000-000000000001'
const CXA = 'd0000001-0000-4000-8000-000000000001'
const CXB = 'd0000002-0000-4000-8000-000000000002'
const U = {
  donoA: '10000000-0000-4000-8000-000000000001', gerA: '10000000-0000-4000-8000-000000000002',
  opA: '10000000-0000-4000-8000-000000000003',
  donoB: '20000000-0000-4000-8000-000000000001', gerB: '20000000-0000-4000-8000-000000000002',
  opB: '20000000-0000-4000-8000-000000000003', multi: '30000000-0000-4000-8000-000000000001',
}

let pass = 0
const t = async (nome, fn) => {
  try { await fn(); pass++; console.log(`ok - ${nome}`) } catch (e) { console.error(`not ok - ${nome}\n  ${e.stack ?? e}`); process.exitCode = 1 }
}

const { db, failed } = await applyAllMigrations()
await t('todas as migrations aplicam (inclui fase 3)', () => assert.deepEqual(failed, []))

await t('todas as reescritas da fase 3 casaram no esquema do repositório', async () => {
  const r = await db.query(`SELECT assinatura, motivo FROM internal.fp_funcoes_reescritas WHERE NOT aplicada`)
  assert.deepEqual(r.rows, [])
  const n = (await db.query(`SELECT count(*)::int n FROM internal.fp_funcoes_reescritas WHERE aplicada`)).rows[0].n
  assert.ok(n >= 20, `reescritas aplicadas: ${n}`)
})

await t('cliente 1 inalterado: config da Empresa 1 é a linha id=1 / chaves atuais', async () => {
  assert.equal((await db.query(`SELECT public.fp_pdv_config_id(NULL) id`)).rows[0].id, 1)
  const n = (await db.query(`SELECT count(*)::int n FROM public.configuracoes_gerais WHERE empresa_id = '${E1}'`)).rows[0].n
  assert.equal(n, 8)
})

await db.exec(`
  INSERT INTO public.empresas (id, nome) VALUES ('${E2}', 'Empresa B');
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES ('${LB}', 'Loja B', '${E2}');
  INSERT INTO auth.users (id) SELECT unnest(ARRAY['${Object.values(U).join("','")}']::uuid[]);
  INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
    ('${U.donoA}', 'Dono A', 'DONO', '${LA}'), ('${U.gerA}', 'Ger A', 'GERENTE', '${LA}'), ('${U.opA}', 'Op A', 'OPERADOR', '${LA}'),
    ('${U.donoB}', 'Dono B', 'DONO', '${LB}'), ('${U.gerB}', 'Ger B', 'GERENTE', '${LB}'), ('${U.opB}', 'Op B', 'OPERADOR', '${LB}'),
    ('${U.multi}', 'Multi', 'GERENTE', '${LA}');
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel) VALUES ('${U.multi}', '${E2}', '${LB}', 'GERENTE');
  INSERT INTO public.caixas (id, loja_id, status) VALUES ('${CXA}', '${LA}', 'ABERTO'), ('${CXB}', '${LB}', 'ABERTO');
  INSERT INTO public.categorias_financeiras (id, nome, empresa_id) VALUES
    ('f0000001-0000-4000-8000-000000000001', 'Aluguel A', '${E1}'), ('f0000002-0000-4000-8000-000000000002', 'Aluguel B', '${E2}');
  INSERT INTO public.produtos (nome, preco_varejo, origem, loja_id, codigo_barras) VALUES
    ('Prod A', 10, 'china_manual', '${LA}', '7890000000001'), ('Prod B', 20, 'china_manual', '${LB}', '7890000000002');
  INSERT INTO public.clientes (nome, loja_id) VALUES ('Cli A', '${LA}'), ('Cli B', '${LB}');
`).catch((e) => { console.error('semente falhou:', e.message); process.exit(1) })

async function como(uid, fn, empresaHeader = null) {
  await db.exec('BEGIN')
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true),
      set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true),
      set_config('request.headers', $2, true)`, [uid, empresaHeader ? JSON.stringify({ 'x-fp-empresa': empresaHeader }) : '{}'])
    await db.exec('SET LOCAL ROLE authenticated')
    return await fn()
  } finally { await db.exec('ROLLBACK') }
}
const q1 = (uid, sql, h) => como(uid, async () => (await db.query(sql)).rows, h)

await t('empresa nova recebe config padrão própria (não copia a do cliente 1)', async () => {
  await db.exec(`UPDATE public.configuracoes_gerais SET valor = '33.00' WHERE empresa_id = '${E1}' AND chave = 'desconto_maximo_operador_percentual'`)
  const r = (await db.query(`SELECT valor FROM public.configuracoes_gerais WHERE empresa_id = '${E2}' AND chave = 'desconto_maximo_operador_percentual'`)).rows
  assert.equal(r[0].valor, '10.00')
  assert.equal((await db.query(`SELECT count(*)::int n FROM public.relatorio_settings WHERE empresa_id = '${E2}'`)).rows[0].n, 1)
  assert.equal((await db.query(`SELECT count(*)::int n FROM public.pdv_config WHERE empresa_id = '${E2}' AND loja_id IS NULL`)).rows[0].n, 1)
})

await t('configuracoes_para_caixa_web: cada empresa lê a sua', async () => {
  const a = (await q1(U.opA, `SELECT public.configuracoes_para_caixa_web() c`))[0].c
  const b = (await q1(U.opB, `SELECT public.configuracoes_para_caixa_web() c`))[0].c
  assert.equal(a.desconto_maximo_operador_percentual, '33.00')
  assert.equal(b.desconto_maximo_operador_percentual, '10.00')
})

await t('configuracoes_gerais: dono B grava a mesma chave sem colidir e sem tocar a de A; não vê a de A', async () => {
  const r = await como(U.donoB, async () => {
    const up = await db.query(`UPDATE public.configuracoes_gerais SET valor = 'true' WHERE chave = 'vendas_suspensas' RETURNING empresa_id`)
    const vis = await db.query(`SELECT DISTINCT empresa_id FROM public.configuracoes_gerais`)
    return { up: up.rows, vis: vis.rows }
  })
  assert.deepEqual(r.up.map((x) => x.empresa_id), [E2])
  assert.deepEqual(r.vis.map((x) => x.empresa_id), [E2])
  await assert.rejects(db.query(`INSERT INTO public.configuracoes_gerais (empresa_id, chave, valor, tipo_dado) VALUES ('${E2}', 'vendas_suspensas', 'x', 'text')`), /duplicate|unique/)
})

await t('vendas_suspensas da empresa B bloqueia venda só no caixa de B', async () => {
  await db.exec(`UPDATE public.configuracoes_gerais SET valor = 'true' WHERE empresa_id = '${E2}' AND chave = 'vendas_suspensas'`)
  await assert.rejects(db.query(`INSERT INTO public.vendas (caixa_id, total_bruto, total_liquido, forma_pagamento) VALUES ('${CXB}', 1, 1, 'DINHEIRO')`), /VENDAS_SUSPENSAS/)
  await db.query(`INSERT INTO public.vendas (caixa_id, total_bruto, total_liquido, forma_pagamento) VALUES ('${CXA}', 1, 1, 'DINHEIRO')`)
  await db.exec(`UPDATE public.configuracoes_gerais SET valor = 'false' WHERE empresa_id = '${E2}' AND chave = 'vendas_suspensas'`)
})

await t('pdv_config por empresa: limite de sangria, flags e config do caixa web', async () => {
  await db.exec(`UPDATE public.pdv_config SET limite_sangria_sem_gerente = 999, blind_closure = true WHERE empresa_id = '${E2}' AND loja_id IS NULL`)
  assert.equal(Number((await q1(U.opA, `SELECT public.obter_limite_sangria_sem_gerente() v`))[0].v), 200)
  assert.equal(Number((await q1(U.opB, `SELECT public.obter_limite_sangria_sem_gerente() v`))[0].v), 999)
  assert.equal((await q1(U.opB, `SELECT * FROM public.pdv_config_para_caixa_web()`))[0].blind_closure, true)
  assert.equal((await q1(U.opA, `SELECT * FROM public.pdv_config_para_caixa_web()`))[0].blind_closure, false)
  const linhasB = await q1(U.donoB, `SELECT empresa_id FROM public.pdv_config`)
  assert.ok(linhasB.every((x) => x.empresa_id === E2), 'dono B só vê pdv_config de B')
})

await t('pricing: uma versão ativa por empresa; cada uma lê a sua', async () => {
  await db.exec(`INSERT INTO public.pricing_config_versions (id, label, is_active, empresa_id) VALUES
    ('c1000000-0000-4000-8000-000000000001', 'A v1', true, '${E1}'), ('c2000000-0000-4000-8000-000000000002', 'B v1', true, '${E2}')`)
  await assert.rejects(db.query(`INSERT INTO public.pricing_config_versions (label, is_active, empresa_id) VALUES ('B v2', true, '${E2}')`), /duplicate|unique/)
  assert.equal((await q1(U.opA, `SELECT public.obter_pricing_version_ativa() v`))[0].v, 'c1000000-0000-4000-8000-000000000001')
  assert.equal((await q1(U.opB, `SELECT public.obter_pricing_version_ativa() v`))[0].v, 'c2000000-0000-4000-8000-000000000002')
})

await t('relatorio_settings: cada empresa vê só a sua linha', async () => {
  const b = await q1(U.donoB, `SELECT empresa_id FROM public.relatorio_settings`)
  assert.deepEqual(b.map((x) => x.empresa_id), [E2])
})

await t('financeiro_painel: categorias financeiras só da empresa do usuário', async () => {
  const b = (await q1(U.donoB, `SELECT public.financeiro_painel(current_date - 30, current_date, 1) p`))[0].p
  const nomes = b.categorias.map((c) => c.nome)
  assert.ok(nomes.includes('Aluguel B') && !nomes.includes('Aluguel A'), `B vê ${nomes}`)
  const a = (await q1(U.donoA, `SELECT public.financeiro_painel(current_date - 30, current_date, 1) p`))[0].p
  assert.ok(!a.categorias.some((c) => c.nome === 'Aluguel B'))
})

await t('financeiro_comando: B não usa categoria financeira de A', async () => {
  await assert.rejects(q1(U.donoB, `SELECT public.financeiro_comando('LANCAR_CONTA_PAGAR',
    '{"categoria_id":"f0000001-0000-4000-8000-000000000001","valor":"10","data":"2026-10-19","descricao":"teste"}'::jsonb, gen_random_uuid())`),
    /Categoria inválida|Selecione categoria|categoria/i)
})

await t('financeiro_comando_operacional: conta de outra loja é recusada', async () => {
  await db.exec(`INSERT INTO public.contas_financeiras (id, loja_id, nome, tipo) VALUES ('fa000001-0000-4000-8000-000000000001', '${LA}', 'Banco A', 'BANCO')`).catch(() => {})
  await assert.rejects(q1(U.donoB, `SELECT public.financeiro_comando_operacional('ALTERAR_CONTA',
    '{"conta_id":"fa000001-0000-4000-8000-000000000001","nome":"hack"}'::jsonb, gen_random_uuid())`), /inválida para esta loja/)
})

await t('listar_caixas_elegiveis_desembolso: só caixas da própria loja', async () => {
  const b = await q1(U.gerB, `SELECT id FROM public.listar_caixas_elegiveis_desembolso()`)
  assert.deepEqual(b.map((x) => x.id), [CXB])
})

await t('listar_vendas_em_espera: só do próprio operador', async () => {
  await db.exec(`INSERT INTO public.vendas_em_espera (loja_id, operador_id, numero_local) VALUES ('${LA}', '${U.opA}', 1)`)
  assert.equal((await q1(U.opB, `SELECT public.listar_vendas_em_espera() v`))[0].v.length, 0)
  assert.equal((await q1(U.opA, `SELECT public.listar_vendas_em_espera() v`))[0].v.length, 1)
})

await t('pdv_diagnostico_pre_producao: dono B não enxerga produto de A pelo código', async () => {
  const chk = async (uid, cod) => (await q1(uid, `SELECT public.pdv_diagnostico_pre_producao('${cod}') d`))[0].d.checks
    .find((c) => c.id === 'estoque_produto_existe').status
  assert.equal(await chk(U.donoB, '7890000000001'), 'aviso')
  assert.equal(await chk(U.donoB, '7890000000002'), 'ok')
  assert.equal(await chk(U.donoA, '7890000000001'), 'ok')
})

await t('seleção de empresa (x-fp-empresa + loja ativa): estreita, nunca amplia', async () => {
  // As policies PERMISSIVE legadas seguem usuarios.loja_id (loja ativa). Trocar de empresa = header
  // x-fp-empresa + loja ativa numa loja daquela empresa (feito pela ação selecionarEmpresa no web).
  const nomes = async (h) => (await q1(U.multi, `SELECT nome FROM public.clientes ORDER BY 1`, h)).map((r) => r.nome)
  assert.deepEqual(await nomes(E1), ['Cli A'])
  assert.deepEqual(await nomes(E2), [], 'header B com loja ativa em A ⇒ nada (guarda e legado discordam ⇒ nega)')
  await db.exec(`UPDATE public.usuarios SET loja_id = '${LB}' WHERE id = '${U.multi}'`)
  assert.deepEqual(await nomes(E2), ['Cli B'])
  assert.deepEqual(await nomes(E1), [], 'header A com loja ativa em B ⇒ nada')
  assert.deepEqual(await nomes('e0000009-0000-4000-8000-000000000009'), [], 'empresa sem vínculo ⇒ nada')
  const v = (await db.query(`SELECT empresa_id, papel, ativo FROM public.usuario_vinculos WHERE usuario_id = '${U.multi}' ORDER BY empresa_id`)).rows
  assert.deepEqual(v.map((x) => [x.empresa_id, x.ativo]), [[E1, true], [E2, true]], 'troca de loja ativa não apaga vínculos')
  assert.deepEqual((await q1(U.opB, `SELECT nome FROM public.clientes`, E1)).map((r) => r.nome), [],
    'header de outra empresa não dá acesso a ela')
  assert.equal((await q1(U.multi, `SELECT public.fp_empresa_contexto(NULL) e`, E2))[0].e, E2)
  await db.exec(`UPDATE public.usuarios SET loja_id = '${LA}' WHERE id = '${U.multi}'`)
})

await t('rollback da fase 3 volta a config global e a migration reaplica', async () => {
  const rb = await readFile(new URL('../supabase/rollback/20261019150000_multiempresa_fase3_config.rollback.sql', import.meta.url), 'utf8')
  const mig = await readFile(new URL('../supabase/migrations/20261019150000_multiempresa_fase3_config.sql', import.meta.url), 'utf8')
  await db.exec(rb)
  const src = (await db.query(`SELECT prosrc FROM pg_proc WHERE proname = 'obter_limite_sangria_sem_gerente'`)).rows[0].prosrc
  assert.match(src, /pc\.id = 1/)
  assert.equal((await db.query(`SELECT count(*)::int n FROM pg_constraint WHERE conname = 'configuracoes_gerais_chave_key'`)).rows[0].n, 1)
  assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'pdv_config' AND column_name = 'empresa_id'`)).rows[0].n, 0)
  await db.exec(mig)
  assert.equal((await db.query(`SELECT count(*)::int n FROM internal.fp_funcoes_reescritas WHERE NOT aplicada`)).rows[0].n, 0)
  assert.equal((await db.query(`SELECT count(*)::int n FROM public.configuracoes_gerais WHERE empresa_id = '${E2}'`)).rows[0].n, 8)
})

console.log(`\n${pass} testes ok${process.exitCode ? ' — HÁ FALHAS' : ''}`)
