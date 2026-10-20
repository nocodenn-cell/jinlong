// Cobrança, planos e trial — esquema REAL (todas as migrations em PGlite).
//  * planos/recursos e gating (cliente 1 sem assinatura = tudo liberado);
//  * isolamento A×B de assinaturas/faturas;
//  * webhook Asaas idempotente (mesmo evento 2×, fora de ordem);
//  * inadimplência → carência → suspensão (módulo vendas_suspensas) → reativação no pagamento;
//  * trial: provisionamento atômico + loja demo + expiração; rate limit;
//  * rollback limpa e a migration reaplica.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyAllMigrations } from './lib/pglite-full-schema.mjs'

const E1 = 'e0000001-0000-4000-8000-000000000001'
const E2 = 'e0000002-0000-4000-8000-000000000002'
const LA = 'a0000001-0000-4000-8000-000000000001'
const LB = 'b0000001-0000-4000-8000-000000000001'
const U = {
  donoA: '10000000-0000-4000-8000-000000000001', opA: '10000000-0000-4000-8000-000000000003',
  donoB: '20000000-0000-4000-8000-000000000001', opB: '20000000-0000-4000-8000-000000000003',
  trial: '40000000-0000-4000-8000-000000000001',
}

let pass = 0
const t = async (nome, fn) => {
  try { await fn(); pass++; console.log(`ok - ${nome}`) } catch (e) { console.error(`not ok - ${nome}\n  ${e.stack ?? e}`); process.exitCode = 1 }
}

const { db, failed } = await applyAllMigrations()
await t('todas as migrations aplicam (inclui cobrança)', () => assert.deepEqual(failed, []))

await db.exec(`
  INSERT INTO public.empresas (id, nome) VALUES ('${E2}', 'Empresa B');
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES ('${LB}', 'Loja B', '${E2}');
  INSERT INTO auth.users (id) SELECT unnest(ARRAY['${Object.values(U).join("','")}']::uuid[]);
  INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
    ('${U.donoA}', 'Dono A', 'DONO', '${LA}'), ('${U.opA}', 'Op A', 'OPERADOR', '${LA}'),
    ('${U.donoB}', 'Dono B', 'DONO', '${LB}'), ('${U.opB}', 'Op B', 'OPERADOR', '${LB}');
`).catch((e) => { console.error('semente falhou:', e.message); process.exit(1) })

async function como(uid, fn) {
  await db.exec('BEGIN')
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true),
      set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [uid])
    await db.exec('SET LOCAL ROLE authenticated')
    return await fn()
  } finally { await db.exec('ROLLBACK') }
}
const q = async (sql, p) => (await db.query(sql, p)).rows
const comoQ = (uid, sql) => como(uid, async () => (await db.query(sql)).rows)
const cfg = async (emp, chave) => (await q(`SELECT valor FROM public.configuracoes_gerais WHERE empresa_id = $1 AND chave = $2`, [emp, chave]))[0]?.valor
const evento = (id, ev, payload) => q(`SELECT public.cobranca_aplicar_evento($1, $2, $3::jsonb) r`, [id, ev, JSON.stringify(payload)]).then((r) => r[0].r)

await t('catálogo: 3 planos + add-on Fiscal, preços marcados como placeholder', async () => {
  const r = await q(`SELECT codigo, tipo, preco_placeholder FROM saas.planos ORDER BY ordem`)
  assert.deepEqual(r.map((x) => x.codigo), ['BASICO', 'ATACADO', 'REDE', 'FISCAL'])
  assert.ok(r.every((x) => x.preco_placeholder))
})

await t('cliente 1 (sem assinatura) mantém todos os recursos', async () => {
  assert.equal((await q(`SELECT public.fp_recursos_empresa('${E1}') r`))[0].r, null)
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E1}', 'transferencias') r`))[0].r, true)
})

await q(`SELECT public.cobranca_registrar_assinatura('${E2}', 'BASICO', '{}', 1, 1, 'PIX', 9900, 'cus_B', 'sub_B', current_date + 30)`)

await t('gating por plano: Básico não tem faixas de preço/transferências; add-on Fiscal soma', async () => {
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E2}', 'pdv') r`))[0].r, true)
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E2}', 'faixas_preco') r`))[0].r, false)
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E2}', 'fiscal') r`))[0].r, false)
  await q(`SELECT public.cobranca_registrar_assinatura('${E2}', 'BASICO', '{FISCAL}', 1, 1, 'PIX', 15800, NULL, NULL, NULL)`)
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E2}', 'fiscal') r`))[0].r, true)
  await assert.rejects(q(`SELECT public.cobranca_registrar_assinatura('${E2}', 'FISCAL', '{}', 1, 1, 'PIX', 1, NULL, NULL, NULL)`), /COBRANCA_PLANO_INVALIDO/)
})

await t('webhook: PAYMENT_CREATED cria fatura; mesmo evento 2× é idempotente', async () => {
  const pay = { id: 'pay_1', subscription: 'sub_B', value: 158.0, dueDate: '2026-11-19', billingType: 'PIX', invoiceUrl: 'https://sandbox.asaas.com/i/1' }
  const r1 = await evento('evt_1', 'PAYMENT_CREATED', { event: 'PAYMENT_CREATED', payment: pay })
  const r2 = await evento('evt_1', 'PAYMENT_CREATED', { event: 'PAYMENT_CREATED', payment: pay })
  assert.equal(r1.duplicado, false); assert.equal(r2.duplicado, true)
  const f = await q(`SELECT valor_centavos, status FROM saas.faturas WHERE empresa_id = '${E2}'`)
  assert.deepEqual(f, [{ valor_centavos: 15800, status: 'PENDENTE' }])
  assert.equal((await q(`SELECT count(*)::int n FROM saas.webhook_eventos WHERE evento_id = 'evt_1'`))[0].n, 1)
})

await t('isolamento A×B: dono/operador de A não veem assinatura/faturas de B; ninguém grava direto', async () => {
  assert.deepEqual((await comoQ(U.donoA, `SELECT public.fp_minhas_faturas(50) r`))[0].r, [])
  assert.deepEqual((await comoQ(U.opA, `SELECT public.fp_minhas_faturas(50) r`))[0].r, [])
  assert.equal((await comoQ(U.donoB, `SELECT public.fp_minhas_faturas(50) r`))[0].r.length, 1)
  // schema saas inacessível direto (nem leitura) para authenticated
  await assert.rejects(como(U.donoB, () => db.query(`SELECT * FROM saas.assinaturas`)), /permission denied/)
  await assert.rejects(como(U.donoB, () => db.query(`SELECT * FROM saas.faturas`)), /permission denied/)
  await assert.rejects(como(U.donoB, () => db.query(`SELECT public.cobranca_estado_empresa('${E1}')`)), /permission denied/)
  const minhaA = (await comoQ(U.donoA, `SELECT public.fp_minha_assinatura() r`))[0].r
  assert.equal(minhaA.empresa_id, E1); assert.equal(minhaA.legado, true)
  const minhaB = (await comoQ(U.donoB, `SELECT public.fp_minha_assinatura() r`))[0].r
  assert.equal(minhaB.plano, 'BASICO'); assert.equal(minhaB.proxima_fatura.asaas_payment_id, 'pay_1')
  await assert.rejects(como(U.donoB, () => db.query(`UPDATE saas.assinaturas SET status = 'ATIVA'`)), /permission denied/)
  await assert.rejects(como(U.donoB, () => db.query(`INSERT INTO saas.faturas (empresa_id, asaas_payment_id, valor_centavos) VALUES ('${E2}', 'x', 0)`)), /permission denied/)
  await assert.rejects(como(U.donoB, () => db.query(`SELECT public.cobranca_aplicar_evento('e', 'PAYMENT_RECEIVED', '{}')`)), /permission denied/)
  await assert.rejects(como(U.donoA, () => db.query(`SELECT * FROM saas.webhook_eventos`)), /permission denied/)
  await assert.rejects(como(U.donoA, () => db.query(`SELECT public.plataforma_iniciar_trial('{}'::jsonb, 15)`)), /permission denied/)
})

await t('evento com empresa desconhecida não altera nada', async () => {
  const r = await evento('evt_x', 'PAYMENT_RECEIVED', { payment: { id: 'pay_x', subscription: 'sub_zz', value: 1 } })
  assert.equal(r.resultado, 'empresa_desconhecida')
  assert.equal((await q(`SELECT count(*)::int n FROM saas.faturas WHERE asaas_payment_id = 'pay_x'`))[0].n, 0)
})

await t('vencida → inadimplente → carência → suspensão usa vendas_suspensas da empresa (A intacta)', async () => {
  await q(`UPDATE public.configuracoes_gerais SET valor = 'motivo manual antigo' WHERE empresa_id = '${E2}' AND chave = 'motivo_suspensao'`)
  const r = await evento('evt_2', 'PAYMENT_OVERDUE', { payment: { id: 'pay_1', subscription: 'sub_B', value: 158, dueDate: '2026-11-19' } })
  assert.equal(r.resultado, 'inadimplente')
  assert.equal((await q(`SELECT public.cobranca_processar_vencimentos(now()) r`))[0].r.suspensas_inadimplencia, 0, 'dentro da carência')
  const j = (await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '6 days') r`))[0].r
  assert.equal(j.suspensas_inadimplencia, 1)
  assert.equal(await cfg(E2, 'vendas_suspensas'), 'true')
  assert.match(await cfg(E2, 'motivo_suspensao'), /atraso/)
  assert.equal(await cfg(E1, 'vendas_suspensas'), 'false')
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E2}', 'pdv') r`))[0].r, false)
  // repetir o job não suspende de novo nem perde o valor anterior
  await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '7 days')`)
  assert.equal((await q(`SELECT motivo_suspensao_antes m FROM saas.assinaturas WHERE empresa_id = '${E2}'`))[0].m, 'motivo manual antigo')
})

await t('pagamento reativa e devolve a config anterior; OVERDUE atrasado não desfaz', async () => {
  const r = await evento('evt_3', 'PAYMENT_RECEIVED', { payment: { id: 'pay_1', subscription: 'sub_B', value: 158, dueDate: '2026-11-19' } })
  assert.equal(r.resultado, 'ativada')
  assert.equal(await cfg(E2, 'vendas_suspensas'), 'false')
  assert.equal(await cfg(E2, 'motivo_suspensao'), 'motivo manual antigo')
  assert.equal((await q(`SELECT status FROM saas.assinaturas WHERE empresa_id = '${E2}'`))[0].status, 'ATIVA')
  await evento('evt_2b', 'PAYMENT_OVERDUE', { payment: { id: 'pay_1', subscription: 'sub_B', value: 158 } })
  assert.equal((await q(`SELECT status FROM saas.faturas WHERE asaas_payment_id = 'pay_1'`))[0].status, 'PAGA')
  assert.equal((await q(`SELECT status FROM saas.assinaturas WHERE empresa_id = '${E2}'`))[0].status, 'ATIVA')
  // reenvio do RECEIVED (retry do Asaas) é no-op
  assert.equal((await evento('evt_3', 'PAYMENT_RECEIVED', {})).duplicado, true)
})

await t('suspensão manual do gerente não é desfeita pela reativação da cobrança', async () => {
  await q(`UPDATE public.configuracoes_gerais SET valor = 'true' WHERE empresa_id = '${E2}' AND chave = 'vendas_suspensas'`)
  await evento('evt_4', 'PAYMENT_OVERDUE', { payment: { id: 'pay_2', subscription: 'sub_B', value: 158 } })
  await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '30 days')`)
  await evento('evt_5', 'PAYMENT_RECEIVED', { payment: { id: 'pay_2', subscription: 'sub_B', value: 158 } })
  assert.equal(await cfg(E2, 'vendas_suspensas'), 'true')
  await q(`UPDATE public.configuracoes_gerais SET valor = 'false' WHERE empresa_id = '${E2}' AND chave = 'vendas_suspensas'`)
})

await t('cancelamento: acesso até o fim do período, depois suspende', async () => {
  await q(`SELECT public.cobranca_cancelar('${E2}')`)
  const a = (await q(`SELECT status, acesso_ate > now() futuro FROM saas.assinaturas WHERE empresa_id = '${E2}'`))[0]
  assert.equal(a.status, 'CANCELADA'); assert.equal(a.futuro, true)
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E2}', 'pdv') r`))[0].r, true)
  await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '40 days')`)
  assert.equal(await cfg(E2, 'vendas_suspensas'), 'true')
  await assert.rejects(q(`SELECT public.cobranca_cancelar('${E2}')`), /COBRANCA_SEM_ASSINATURA_ATIVA/)
})

let trial
await t('trial: cria empresa + loja + dono + assinatura TRIAL 15 dias + produtos demo, atômico', async () => {
  trial = (await q(`SELECT public.plataforma_iniciar_trial($1::jsonb, 15) r`, [JSON.stringify({
    plano: 'ATACADO',
    empresa: { nome: 'Loja Trial' }, lojas: [{ chave: 'l1', nome: 'Loja Trial', codigo: 'TRIAL1' }],
    usuarios: [{ id: U.trial, nome: 'Dona Trial', papel: 'DONO' }],
  })]))[0].r
  const a = (await q(`SELECT status, plano_codigo, (trial_fim - now()) > interval '14 days' ok FROM saas.assinaturas WHERE empresa_id = $1`, [trial.empresa_id]))[0]
  assert.deepEqual(a, { status: 'TRIAL', plano_codigo: 'ATACADO', ok: true })
  assert.equal(trial.produtos_demo, 6)
  assert.equal((await q(`SELECT max_lojas FROM public.empresas WHERE id = $1`, [trial.empresa_id]))[0].max_lojas, 1)
  assert.equal((await comoQ(U.trial, `SELECT count(*)::int n FROM public.produtos`))[0].n, 6)
  assert.equal((await comoQ(U.donoB, `SELECT count(*)::int n FROM public.produtos WHERE observacao = 'DEMO_TRIAL'`))[0].n, 0)
})

await t('trial: falha no meio não deixa nada (usuário de outra empresa)', async () => {
  const antes = (await q(`SELECT count(*)::int n FROM public.empresas`))[0].n
  await assert.rejects(q(`SELECT public.plataforma_iniciar_trial($1::jsonb, 15)`, [JSON.stringify({
    empresa: { nome: 'Abuso' }, lojas: [{ nome: 'X' }], usuarios: [{ id: U.donoB, nome: 'B', papel: 'DONO' }] })]), /TRIAL_USUARIO_JA_EXISTE/)
  assert.equal((await q(`SELECT count(*)::int n FROM public.empresas`))[0].n, antes)
})

await t('trial expira → SUSPENSA (TRIAL_EXPIRADO) → assinatura + pagamento reativam', async () => {
  const j = (await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '16 days') r`))[0].r
  assert.equal(j.trial_expirado, 1)
  assert.equal(await cfg(trial.empresa_id, 'vendas_suspensas'), 'true')
  assert.equal((await comoQ(U.trial, `SELECT public.fp_minha_assinatura() r`))[0].r.motivo_status, 'TRIAL_EXPIRADO')
  await q(`SELECT public.cobranca_registrar_assinatura($1, 'ATACADO', '{}', 1, 1, 'BOLETO', 17900, 'cus_T', 'sub_T', NULL)`, [trial.empresa_id])
  await evento('evt_t1', 'PAYMENT_CONFIRMED', { payment: { id: 'pay_t1', subscription: 'sub_T', value: 179 } })
  assert.equal(await cfg(trial.empresa_id, 'vendas_suspensas'), 'false')
})

await t('rate limit do trial: 3 por IP em 24h', async () => {
  const r = []
  for (let i = 0; i < 4; i++) r.push((await q(`SELECT public.trial_registrar_tentativa('iphash', 'e${i}') ok`))[0].ok)
  assert.deepEqual(r, [true, true, true, false])
  assert.equal((await q(`SELECT public.trial_registrar_tentativa('outro-ip', 'e9') ok`))[0].ok, true)
})

// ── requisitos adicionais ─────────────────────────────────────────────────────
await t('cobrança SaaS fora do public (separada do financeiro dos lojistas)', async () => {
  const r = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    AND table_name IN ('planos','assinaturas','faturas','webhook_eventos','assinatura_auditoria')`)
  assert.deepEqual(r, [])
  assert.equal((await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = 'saas'`))[0].n >= 7, true)
})

const E3 = 'e0000003-0000-4000-8000-000000000003'
const LC = 'c0000003-0000-4000-8000-000000000001'
await db.exec(`INSERT INTO public.empresas (id, nome) VALUES ('${E3}', 'Empresa C');
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES ('${LC}', 'Loja C', '${E3}');`)
await q(`SELECT public.cobranca_registrar_assinatura('${E3}', 'ATACADO', '{}', 1, 1, 'PIX', 17900, 'cus_C', 'sub_C', current_date + 30)`)

await t('pagamento duplicado (CONFIRMED e depois RECEIVED do mesmo pagamento) = 1 fatura PAGA, sem efeito duplo', async () => {
  await evento('c1', 'PAYMENT_CONFIRMED', { payment: { id: 'payC1', subscription: 'sub_C', value: 179 } })
  await evento('c2', 'PAYMENT_RECEIVED', { payment: { id: 'payC1', subscription: 'sub_C', value: 179 } })
  assert.deepEqual(await q(`SELECT status FROM saas.faturas WHERE empresa_id = '${E3}'`), [{ status: 'PAGA' }])
  assert.equal((await q(`SELECT status FROM saas.assinaturas WHERE empresa_id = '${E3}'`))[0].status, 'ATIVA')
})

await t('fora de ordem: RECEIVED antes do CREATED não volta a fatura para PENDENTE', async () => {
  await evento('c3', 'PAYMENT_RECEIVED', { payment: { id: 'payC2', subscription: 'sub_C', value: 179 } })
  await evento('c4', 'PAYMENT_CREATED', { payment: { id: 'payC2', subscription: 'sub_C', value: 179 } })
  assert.equal((await q(`SELECT status FROM saas.faturas WHERE asaas_payment_id = 'payC2'`))[0].status, 'PAGA')
})

await t('conciliação: webhook perdido é recuperado pelo polling; repetir é idempotente', async () => {
  // Asaas diz que payC3 venceu, mas o webhook nunca chegou
  const r1 = (await q(`SELECT public.cobranca_conciliar_pagamento($1::jsonb) r`, [JSON.stringify({ id: 'payC3', subscription: 'sub_C', status: 'OVERDUE', value: 179 })]))[0].r
  assert.equal(r1.resultado, 'inadimplente')
  const r2 = (await q(`SELECT public.cobranca_conciliar_pagamento($1::jsonb) r`, [JSON.stringify({ id: 'payC3', subscription: 'sub_C', status: 'OVERDUE', value: 179 })]))[0].r
  assert.equal(r2.duplicado, true)
  const r3 = (await q(`SELECT public.cobranca_conciliar_pagamento($1::jsonb) r`, [JSON.stringify({ id: 'payC3', subscription: 'sub_C', status: 'RECEIVED', value: 179 })]))[0].r
  assert.equal(r3.resultado, 'ativada')
})

await t('falha transitória do Asaas: inadimplente sem fatura VENCIDA confirmada não é suspensa', async () => {
  // simula status INADIMPLENTE "sem prova" (ex.: erro de leitura); job não suspende
  await db.exec(`UPDATE saas.assinaturas SET status = 'INADIMPLENTE', inadimplente_desde = now() - interval '30 days' WHERE empresa_id = '${E3}'`)
  const j = (await q(`SELECT public.cobranca_processar_vencimentos(now()) r`))[0].r
  assert.equal(j.suspensas_inadimplencia, 0)
  assert.equal(await cfg(E3, 'vendas_suspensas'), 'false')
  await db.exec(`UPDATE saas.assinaturas SET status = 'ATIVA', inadimplente_desde = NULL WHERE empresa_id = '${E3}'`)
})

await t('aviso antes da suspensão: minha_assinatura informa data prevista e aviso', async () => {
  await evento('c5', 'PAYMENT_OVERDUE', { payment: { id: 'payC4', subscription: 'sub_C', value: 179 } })
  await db.exec(`INSERT INTO auth.users (id) VALUES ('50000000-0000-4000-8000-000000000001');
    INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES ('50000000-0000-4000-8000-000000000001', 'Dono C', 'DONO', '${LC}')`)
  const m = (await comoQ('50000000-0000-4000-8000-000000000001', `SELECT public.fp_minha_assinatura() r`))[0].r
  assert.equal(m.status, 'INADIMPLENTE'); assert.equal(m.aviso_vencimento, true); assert.ok(m.suspensao_prevista_em)
  assert.equal(await cfg(E3, 'vendas_suspensas'), 'false', 'ainda na carência')
  // suspensão preserva dados: nada é apagado
  await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '10 days')`)
  assert.equal(await cfg(E3, 'vendas_suspensas'), 'true')
  assert.equal((await q(`SELECT count(*)::int n FROM public.lojas WHERE empresa_id = '${E3}'`))[0].n, 1)
  assert.ok((await q(`SELECT count(*)::int n FROM saas.faturas WHERE empresa_id = '${E3}'`))[0].n >= 4)
  await evento('c6', 'PAYMENT_RECEIVED', { payment: { id: 'payC4', subscription: 'sub_C', value: 179 } })
  assert.equal(await cfg(E3, 'vendas_suspensas'), 'false')
})

await t('troca de plano: recursos mudam e auditoria registra antes/depois', async () => {
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E3}', 'transferencias') r`))[0].r, false)
  await q(`SELECT public.cobranca_registrar_assinatura('${E3}', 'REDE', '{FISCAL}', 3, 4, 'BOLETO', 99999, NULL, NULL, NULL)`)
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E3}', 'transferencias') r`))[0].r, true)
  assert.equal((await q(`SELECT public.fp_empresa_tem_recurso('${E3}', 'fiscal') r`))[0].r, true)
  const a = await q(`SELECT antes->>'plano_codigo' a, depois->>'plano_codigo' d FROM saas.assinatura_auditoria
    WHERE empresa_id = '${E3}' ORDER BY id DESC LIMIT 1`)
  assert.deepEqual(a, [{ a: 'ATACADO', d: 'REDE' }])
  assert.ok((await q(`SELECT count(*)::int n FROM saas.assinatura_auditoria WHERE empresa_id = '${E3}' AND origem = 'webhook'`))[0].n >= 1)
})

await t('limite de lojas do plano (cliente 1 sem limite)', async () => {
  await q(`INSERT INTO public.lojas (nome, empresa_id) VALUES ('C2', '${E3}'), ('C3', '${E3}')`)
  await assert.rejects(q(`INSERT INTO public.lojas (nome, empresa_id) VALUES ('C4', '${E3}')`), /LOJA_LIMITE_PLANO/)
  await q(`INSERT INTO public.lojas (nome, empresa_id) VALUES ('Filial extra E1', '${E1}')`)
})

await t('trial: duração configurável em saas.parametros', async () => {
  await db.exec(`UPDATE saas.parametros SET valor = '7' WHERE chave = 'trial_dias';
    INSERT INTO auth.users (id) VALUES ('60000000-0000-4000-8000-000000000001')`)
  const r = (await q(`SELECT public.plataforma_iniciar_trial($1::jsonb) r`, [JSON.stringify({
    empresa: { nome: 'Trial 7' }, lojas: [{ nome: 'Trial 7' }], usuarios: [{ id: '60000000-0000-4000-8000-000000000001', nome: 'X', papel: 'DONO' }] })]))[0].r
  const d = (await q(`SELECT round(extract(epoch FROM trial_fim - now()) / 86400)::int d FROM saas.assinaturas WHERE empresa_id = $1`, [r.empresa_id]))[0].d
  assert.equal(d, 7)
  await db.exec(`UPDATE saas.parametros SET valor = '15' WHERE chave = 'trial_dias'`)
})

await t('compatibilidade: Empresa 1 continua sem assinatura, sem bloqueio, config intacta', async () => {
  assert.equal((await q(`SELECT count(*)::int n FROM saas.assinaturas WHERE empresa_id = '${E1}'`))[0].n, 0)
  assert.equal((await q(`SELECT public.fp_recursos_empresa('${E1}') r`))[0].r, null)
  assert.equal(await cfg(E1, 'vendas_suspensas'), 'false')
  assert.equal((await comoQ(U.donoA, `SELECT public.fp_minha_assinatura() r`))[0].r.legado, true)
})

await t('acesso não autorizado: anon não executa nada de cobrança', async () => {
  await db.exec('BEGIN'); await db.exec('SET LOCAL ROLE anon')
  try {
    await assert.rejects(db.query(`SELECT public.fp_minha_assinatura()`), /permission denied/)
  } finally { await db.exec('ROLLBACK') }
  await db.exec('BEGIN'); await db.exec('SET LOCAL ROLE anon')
  try {
    await assert.rejects(db.query(`SELECT public.trial_registrar_tentativa('a','b',3)`), /permission denied/)
  } finally { await db.exec('ROLLBACK') }
})

// ── segurança das funções SECURITY DEFINER da cobrança ─────────────────────────
const SQL_MIG = await readFile(new URL('../supabase/migrations/20261020100000_cobranca_planos_trial.sql', import.meta.url), 'utf8')
const FUNCS = [...new Set([...SQL_MIG.matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+)\.([a-z_]+)\(/g)].map((m) => `${m[1]}.${m[2]}`))]
const LEITURA_DONO = new Set(['public.fp_recursos_empresa', 'public.fp_empresa_tem_recurso', 'public.fp_minha_assinatura', 'public.fp_minhas_faturas', 'public.planos_catalogo'])

await t(`segurança: ${FUNCS.length} funções da cobrança — search_path fixo, sem PUBLIC/anon, escrita só service_role`, async () => {
  assert.ok(FUNCS.length >= 15, FUNCS.join(','))
  for (const f of FUNCS) {
    const [sch, nome] = f.split('.')
    const rows = await q(`SELECT p.oid, p.prosecdef, p.proconfig, p.prorettype = 'trigger'::regtype trg,
        coalesce(array_to_string(p.proacl, ','), '') acl,
        has_function_privilege('anon', p.oid, 'EXECUTE') anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') auth
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1 AND p.proname = $2`, [sch, nome])
    assert.ok(rows.length >= 1, `${f} não existe`)
    for (const r of rows) {
      if (r.prosecdef) assert.ok((r.proconfig ?? []).some((c) => /^search_path=/.test(c) && /pg_temp/.test(c)), `${f} sem search_path fixo`)
      assert.ok(!/(^|,)=X/.test(r.acl), `${f} executável por PUBLIC (${r.acl})`)
      assert.equal(r.anon, false, `${f} executável por anon`)
      if (sch === 'public' && !LEITURA_DONO.has(f)) assert.equal(r.auth, false, `${f} executável por authenticated`)
    }
  }
})

await t('segurança: leituras do dono são escopadas à empresa da sessão (B não vê C)', async () => {
  const mB = (await comoQ(U.donoB, `SELECT public.fp_minha_assinatura() r`))[0].r
  assert.notEqual(mB?.empresa_id, E3)
  const fB = (await comoQ(U.donoB, `SELECT public.fp_minhas_faturas() r`))[0].r
  assert.ok(!JSON.stringify(fB).includes('payC'), 'faturas de C vazaram para B')
  await assert.rejects(como(U.donoB, () => db.query(`SELECT * FROM saas.faturas`)), /permission denied/)
})

await t('segurança: entradas inválidas são recusadas (plano, dias, payload)', async () => {
  await assert.rejects(q(`SELECT public.plataforma_iniciar_trial('{"plano":"FISCAL","empresa":{"nome":"x"},"lojas":[{"nome":"x"}],"usuarios":[{"id":"70000000-0000-4000-8000-000000000009","nome":"x"}]}'::jsonb, 15)`), /COBRANCA_PLANO_INVALIDO/)
  await assert.rejects(q(`SELECT public.plataforma_iniciar_trial('{"empresa":{"nome":"x"},"lojas":[{"nome":"x"}],"usuarios":[{"id":"70000000-0000-4000-8000-000000000009","nome":"x"}]}'::jsonb, 999)`), /TRIAL_DIAS_INVALIDO/)
  await assert.rejects(q(`SELECT public.plataforma_iniciar_trial('{"empresa":{"nome":"x"},"lojas":[{"nome":"a"},{"nome":"b"}],"usuarios":[{"id":"70000000-0000-4000-8000-000000000009","nome":"x"}]}'::jsonb, 15)`), /TRIAL_PAYLOAD_INVALIDO/)
})

// ── trial não concede acesso a outra empresa ─────────────────────────────────
await t('trial: empresa.id / loja.id / empresa_id / papel no payload são ignorados (sempre empresa nova)', async () => {
  const uid = '70000000-0000-4000-8000-000000000001'
  await db.exec(`INSERT INTO auth.users (id) VALUES ('${uid}')`)
  const lojasE1 = (await q(`SELECT count(*)::int n FROM public.lojas WHERE empresa_id = '${E1}'`))[0].n
  const r = (await q(`SELECT public.plataforma_iniciar_trial($1::jsonb, 15) r`, [JSON.stringify({
    empresa: { id: E1, nome: 'Invasor' }, empresa_id: E1,
    lojas: [{ id: LA, empresa_id: E1, nome: 'Invasor', codigo: 'X1' }],
    usuarios: [{ id: uid, nome: 'Inv', papel: 'GERENTE', lojas: [LA], empresa_id: E1 }] })]))[0].r
  assert.notEqual(r.empresa_id, E1); assert.notEqual(r.loja_id, LA)
  assert.equal((await q(`SELECT count(*)::int n FROM public.lojas WHERE empresa_id = '${E1}'`))[0].n, lojasE1)
  assert.deepEqual(await q(`SELECT DISTINCT empresa_id::text e, papel FROM public.usuario_vinculos WHERE usuario_id = $1`, [uid]),
    [{ e: r.empresa_id, papel: 'DONO' }])
  // o dono do trial não enxerga nada da Empresa 1
  assert.equal((await comoQ(uid, `SELECT count(*)::int n FROM public.lojas WHERE id = '${LA}'`))[0].n, 0)
  assert.equal((await comoQ(uid, `SELECT count(*)::int n FROM public.produtos WHERE observacao IS DISTINCT FROM 'DEMO_TRIAL'`))[0].n, 0)
})

await t('trial: código de loja já usado vira outro código, em outra loja', async () => {
  const uid = '70000000-0000-4000-8000-000000000002'
  await db.exec(`INSERT INTO auth.users (id) VALUES ('${uid}')`)
  const cod = (await q(`SELECT codigo FROM public.lojas WHERE codigo IS NOT NULL LIMIT 1`))[0]?.codigo ?? 'TRIAL1'
  const r = (await q(`SELECT public.plataforma_iniciar_trial($1::jsonb, 15) r`, [JSON.stringify({
    empresa: { nome: 'Cod dup' }, lojas: [{ nome: 'Cod dup', codigo: cod }], usuarios: [{ id: uid, nome: 'D', papel: 'DONO' }] })]))[0].r
  const l = (await q(`SELECT codigo, empresa_id::text e FROM public.lojas WHERE id = $1`, [r.loja_id]))[0]
  assert.notEqual(l.codigo, cod); assert.equal(l.e, r.empresa_id)
})

await t('trial: dono existente / usuário de outra empresa / Empresa 1 é recusado sem efeito', async () => {
  const antes = (await q(`SELECT count(*)::int n FROM public.empresas`))[0].n
  for (const uid of [U.trial, U.donoA, U.opB]) {
    await assert.rejects(q(`SELECT public.plataforma_iniciar_trial($1::jsonb, 15)`, [JSON.stringify({
      empresa: { nome: 'Reuso' }, lojas: [{ nome: 'R' }], usuarios: [{ id: uid, nome: 'R', papel: 'DONO' }] })]), /TRIAL_USUARIO_JA_EXISTE/)
  }
  assert.equal((await q(`SELECT count(*)::int n FROM public.empresas`))[0].n, antes)
  assert.equal((await q(`SELECT perfil FROM public.usuarios WHERE id = '${U.donoA}'`))[0].perfil, 'DONO')
})

// ── suspensão: venda online (web) e replay offline (sync) ─────────────────────
const CXC = 'cc000003-0000-4000-8000-000000000001'
const CXA1 = 'cc000001-0000-4000-8000-000000000001'
await db.exec(`INSERT INTO public.caixas (id, loja_id, status) VALUES ('${CXC}', '${LC}', 'ABERTO'), ('${CXA1}', '${LA}', 'ABERTO')`)
const DONO_C = '50000000-0000-4000-8000-000000000001'
const vendaSR = (cx) => (async () => {
  await db.exec('BEGIN'); await db.exec('SET LOCAL ROLE service_role')
  try { await db.query(`INSERT INTO public.vendas (caixa_id, total_bruto, total_liquido, forma_pagamento) VALUES ($1, 1, 1, 'DINHEIRO')`, [cx]) }
  finally { await db.exec('ROLLBACK') }
})()
const vendaWeb = (uid, cx) => como(uid, () => db.query(`INSERT INTO public.vendas (caixa_id, total_bruto, total_liquido, forma_pagamento) VALUES ($1, 1, 1, 'DINHEIRO')`, [cx]))

await t('suspensão por inadimplência bloqueia venda web E replay offline (sync/service_role); pagamento libera; Empresa 1 nunca bloqueia', async () => {
  await vendaSR(CXC)                          // ativa: replay aceito
  await evento('s1', 'PAYMENT_OVERDUE', { payment: { id: 'paySusp', subscription: 'sub_C', value: 179 } })
  await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '10 days')`)
  assert.equal(await cfg(E3, 'vendas_suspensas'), 'true')
  await assert.rejects(vendaSR(CXC), /VENDAS_SUSPENSAS/)          // replay do PDV: recusado ⇒ fica na outbox (retry/backoff)
  await assert.rejects(vendaWeb(DONO_C, CXC), /VENDAS_SUSPENSAS|permission denied|row-level/) // web
  await vendaSR(CXA1)                          // Empresa 1 intacta durante a suspensão de C
  await evento('s2', 'PAYMENT_RECEIVED', { payment: { id: 'paySusp', subscription: 'sub_C', value: 179 } })
  assert.equal(await cfg(E3, 'vendas_suspensas'), 'false')
  await vendaSR(CXC)                          // reativada: o mesmo replay agora entra
})

await t('falha transitória do Asaas (conciliação sem resposta) não suspende ninguém', async () => {
  // a rota de conciliação só chama cobranca_conciliar_pagamento com resposta válida do Asaas;
  // sem resposta não há evento — o job de vencimentos sozinho não suspende ATIVA nem INADIMPLENTE sem fatura VENCIDA.
  const j = (await q(`SELECT public.cobranca_processar_vencimentos(now()) r`))[0].r
  assert.equal(j.suspensas_inadimplencia, 0)
  assert.equal(await cfg(E3, 'vendas_suspensas'), 'false')
  assert.equal(await cfg(E1, 'vendas_suspensas'), 'false')
})

await t('rollback limpa (e reativa vendas suspensas pela cobrança); migration reaplica', async () => {
  await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '400 days')`)
  await db.exec(await readFile(new URL('../supabase/rollback/20261020100000_cobranca_planos_trial.rollback.sql', import.meta.url), 'utf8'))
  assert.equal((await q(`SELECT to_regclass('saas.assinaturas') r`))[0].r, null)
  assert.equal((await q(`SELECT count(*)::int n FROM pg_namespace WHERE nspname = 'saas'`))[0].n, 0)
  assert.equal(await cfg(E2, 'vendas_suspensas'), 'false')
  await db.exec(await readFile(new URL('../supabase/migrations/20261020100000_cobranca_planos_trial.sql', import.meta.url), 'utf8'))
  assert.equal((await q(`SELECT count(*)::int n FROM saas.planos`))[0].n, 4)
})



console.log(`\n${pass} ok`)
