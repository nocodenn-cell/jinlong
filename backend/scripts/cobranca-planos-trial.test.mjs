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
  const r = await q(`SELECT codigo, tipo, preco_placeholder FROM public.planos ORDER BY ordem`)
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
  const f = await q(`SELECT valor_centavos, status FROM public.faturas WHERE empresa_id = '${E2}'`)
  assert.deepEqual(f, [{ valor_centavos: 15800, status: 'PENDENTE' }])
  assert.equal((await q(`SELECT count(*)::int n FROM public.cobranca_webhook_eventos WHERE evento_id = 'evt_1'`))[0].n, 1)
})

await t('isolamento A×B: dono/operador de A não veem assinatura/faturas de B; ninguém grava direto', async () => {
  assert.equal((await comoQ(U.donoA, `SELECT count(*)::int n FROM public.assinaturas`))[0].n, 0)
  assert.equal((await comoQ(U.opA, `SELECT count(*)::int n FROM public.faturas`))[0].n, 0)
  assert.equal((await comoQ(U.donoB, `SELECT count(*)::int n FROM public.faturas`))[0].n, 1)
  const minhaA = (await comoQ(U.donoA, `SELECT public.fp_minha_assinatura() r`))[0].r
  assert.equal(minhaA.empresa_id, E1); assert.equal(minhaA.legado, true)
  const minhaB = (await comoQ(U.donoB, `SELECT public.fp_minha_assinatura() r`))[0].r
  assert.equal(minhaB.plano, 'BASICO'); assert.equal(minhaB.proxima_fatura.asaas_payment_id, 'pay_1')
  await assert.rejects(como(U.donoB, () => db.query(`UPDATE public.assinaturas SET status = 'ATIVA'`)), /permission denied/)
  await assert.rejects(como(U.donoB, () => db.query(`INSERT INTO public.faturas (empresa_id, asaas_payment_id, valor_centavos) VALUES ('${E2}', 'x', 0)`)), /permission denied/)
  await assert.rejects(como(U.donoB, () => db.query(`SELECT public.cobranca_aplicar_evento('e', 'PAYMENT_RECEIVED', '{}')`)), /permission denied/)
  await assert.rejects(como(U.donoA, () => db.query(`SELECT * FROM public.cobranca_webhook_eventos`)), /permission denied/)
  await assert.rejects(como(U.donoA, () => db.query(`SELECT public.plataforma_iniciar_trial('{}'::jsonb, 15)`)), /permission denied/)
})

await t('evento com empresa desconhecida não altera nada', async () => {
  const r = await evento('evt_x', 'PAYMENT_RECEIVED', { payment: { id: 'pay_x', subscription: 'sub_zz', value: 1 } })
  assert.equal(r.resultado, 'empresa_desconhecida')
  assert.equal((await q(`SELECT count(*)::int n FROM public.faturas WHERE asaas_payment_id = 'pay_x'`))[0].n, 0)
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
  assert.equal((await q(`SELECT motivo_suspensao_antes m FROM public.assinaturas WHERE empresa_id = '${E2}'`))[0].m, 'motivo manual antigo')
})

await t('pagamento reativa e devolve a config anterior; OVERDUE atrasado não desfaz', async () => {
  const r = await evento('evt_3', 'PAYMENT_RECEIVED', { payment: { id: 'pay_1', subscription: 'sub_B', value: 158, dueDate: '2026-11-19' } })
  assert.equal(r.resultado, 'ativada')
  assert.equal(await cfg(E2, 'vendas_suspensas'), 'false')
  assert.equal(await cfg(E2, 'motivo_suspensao'), 'motivo manual antigo')
  assert.equal((await q(`SELECT status FROM public.assinaturas WHERE empresa_id = '${E2}'`))[0].status, 'ATIVA')
  await evento('evt_2b', 'PAYMENT_OVERDUE', { payment: { id: 'pay_1', subscription: 'sub_B', value: 158 } })
  assert.equal((await q(`SELECT status FROM public.faturas WHERE asaas_payment_id = 'pay_1'`))[0].status, 'PAGA')
  assert.equal((await q(`SELECT status FROM public.assinaturas WHERE empresa_id = '${E2}'`))[0].status, 'ATIVA')
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
  const a = (await q(`SELECT status, acesso_ate > now() futuro FROM public.assinaturas WHERE empresa_id = '${E2}'`))[0]
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
  const a = (await q(`SELECT status, plano_codigo, (trial_fim - now()) > interval '14 days' ok FROM public.assinaturas WHERE empresa_id = $1`, [trial.empresa_id]))[0]
  assert.deepEqual(a, { status: 'TRIAL', plano_codigo: 'ATACADO', ok: true })
  assert.equal(trial.produtos_demo, 6)
  assert.equal((await q(`SELECT max_lojas FROM public.empresas WHERE id = $1`, [trial.empresa_id]))[0].max_lojas, 1)
  assert.equal((await comoQ(U.trial, `SELECT count(*)::int n FROM public.produtos`))[0].n, 6)
  assert.equal((await comoQ(U.donoB, `SELECT count(*)::int n FROM public.produtos WHERE observacao = 'DEMO_TRIAL'`))[0].n, 0)
})

await t('trial: falha no meio não deixa nada (usuário de outra empresa)', async () => {
  const antes = (await q(`SELECT count(*)::int n FROM public.empresas`))[0].n
  await assert.rejects(q(`SELECT public.plataforma_iniciar_trial($1::jsonb, 15)`, [JSON.stringify({
    empresa: { nome: 'Abuso' }, lojas: [{ nome: 'X' }], usuarios: [{ id: U.donoB, nome: 'B', papel: 'DONO' }] })]), /PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA/)
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

await t('rollback limpa (e reativa vendas suspensas pela cobrança); migration reaplica', async () => {
  await q(`SELECT public.cobranca_processar_vencimentos(now() + interval '400 days')`)
  await db.exec(await readFile(new URL('../supabase/rollback/20261020100000_cobranca_planos_trial.rollback.sql', import.meta.url), 'utf8'))
  assert.equal((await q(`SELECT to_regclass('public.assinaturas') r`))[0].r, null)
  assert.equal(await cfg(E2, 'vendas_suspensas'), 'false')
  await db.exec(await readFile(new URL('../supabase/migrations/20261020100000_cobranca_planos_trial.sql', import.meta.url), 'utf8'))
  assert.equal((await q(`SELECT count(*)::int n FROM public.planos`))[0].n, 4)
})

console.log(`\n${pass} ok`)
