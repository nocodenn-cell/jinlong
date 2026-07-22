/**
 * Missão 4.1 — Financeiro nasce da venda (DINHEIRO).
 *
 * Prova ciclo comercial:
 *   venda → pagamento → estoque → valor esperado do caixa/turno
 *
 * Uso:
 *   node --env-file=pdv-importados/.env.local backend/supabase/scripts/ops_missao4_venda_financeiro.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const gerenteEmail =
  process.env.SEED_GERENTE_EMAIL || process.env.PLAYWRIGHT_TEST_EMAIL
const operadorEmail =
  process.env.SEED_OPERADOR_EMAIL || process.env.PLAYWRIGHT_CAIXA_TEST_EMAIL
const password =
  process.env.SEED_DEV_PASSWORD ||
  process.env.PLAYWRIGHT_CAIXA_TEST_PASSWORD ||
  process.env.PLAYWRIGHT_TEST_PASSWORD

const VALOR = 100

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}
function ok(step, detail) {
  console.log(`OK  ${step}${detail ? ` — ${detail}` : ''}`)
}

if (!url || !serviceKey || !anonKey || !gerenteEmail || !operadorEmail || !password) {
  fail('Missing env')
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const authClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const report = { startedAt: new Date().toISOString(), valor: VALOR, steps: [] }
function step(name, data) {
  report.steps.push({ name, ...data, at: new Date().toISOString() })
}

async function valorSistemaDinheiro(caixaId) {
  const { data, error } = await admin.rpc('calcular_valor_sistema_dinheiro_caixa', {
    p_caixa_id: caixaId,
  })
  if (error) {
    // algumas envs retornam scalar direto / nome diferente
    const { data: d2, error: e2 } = await admin.rpc('calcular_valor_sistema_dinheiro_caixa', {
      p_caixa_id: caixaId,
    })
    if (e2) fail(`calcular_valor_sistema_dinheiro_caixa: ${error.message}`)
    return Number(d2)
  }
  return Number(data)
}

async function main() {
  const { data: gAuth, error: gErr } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  if (gErr || !gAuth.user) fail(`login gerente: ${gErr?.message}`)
  const gerenteId = gAuth.user.id

  const { data: uG } = await admin
    .from('usuarios')
    .select('loja_id')
    .eq('id', gerenteId)
    .single()
  const lojaId = uG.loja_id
  ok('loja', lojaId)

  const barcode = `7898${String(Date.now()).slice(-9)}`
  const { data: created, error: cErr } = await admin.rpc('criar_produto_com_estoque_inicial', {
    p_payload: {
      nome: `Missao4 Produto ${stamp}`,
      codigo_barras: barcode,
      preco_varejo: VALOR,
      preco_atacado: VALOR,
      origem: 'china_manual',
      tem_nf: false,
      unidade_medida: 'UN',
      ativo: true,
      status_publicacao: 'PUBLICADO',
      estoque_inicial_quantidade: 5,
      estoque_inicial_minimo: 0,
    },
    p_ator_id: gerenteId,
    p_request_id: randomUUID(),
  })
  if (cErr) fail(`criar produto: ${cErr.message}`)
  const produtoId = created.produto_id
  ok('produto', produtoId)
  step('produto', { produtoId, barcode })

  const { data: opAuth, error: oErr } = await authClient.auth.signInWithPassword({
    email: operadorEmail,
    password,
  })
  if (oErr || !opAuth.user) fail(`login operador: ${oErr?.message}`)
  const operadorId = opAuth.user.id
  const opClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${opAuth.session.access_token}` } },
  })

  let { data: caixa } = await opClient
    .from('caixas')
    .select('id')
    .eq('operador_id', operadorId)
    .eq('status', 'ABERTO')
    .order('data_abertura', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!caixa?.id) {
    const { data: aberto, error: aErr } = await opClient
      .from('caixas')
      .insert({
        loja_id: lojaId,
        operador_id: operadorId,
        status: 'ABERTO',
        valor_inicial: 0,
        data_abertura: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (aErr) fail(`abrir caixa: ${aErr.message}`)
    caixa = aberto
  }
  const caixaId = caixa.id
  ok('caixa', caixaId)

  const esperadoAntes = await valorSistemaDinheiro(caixaId)
  ok('esperado dinheiro ANTES', String(esperadoAntes))
  step('esperado_antes', { esperadoAntes })

  const { count: movCaixaAntes } = await admin
    .from('movimentacoes_caixa')
    .select('id', { count: 'exact', head: true })
    .eq('caixa_id', caixaId)

  const vendaId = randomUUID()
  const { data: vendaRes, error: vErr } = await opClient.rpc(
    'finalizar_venda_transacional_canonica_v4',
    {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_forma_pagamento: 'DINHEIRO',
      p_total_bruto: VALOR,
      p_total_desconto: 0,
      p_total_liquido: VALOR,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: VALOR }],
      p_itens: [
        {
          item_id: randomUUID(),
          produto_id: produtoId,
          quantidade: 1,
          preco_original: VALOR,
          preco_unitario: VALOR,
          desconto_unitario: 0,
          tipo_preco: 'VAREJO',
          custo_unitario_snap: null,
          tipo_preco_fonte: 'CADASTRO',
          regra_aplicada_id: null,
        },
      ],
      p_desconto_gerente_token: null,
      p_desconto_gerente_percentual: null,
      p_strict_manager_discount_auth: false,
      p_fiscal_auto_enqueue: false,
      p_ip_address: '127.0.0.1',
      p_user_agent: 'ops-missao4',
      p_device_id: 'ops-missao4',
      p_terminal_id: 'ops-script',
      p_cliente_id: null,
    },
  )
  if (vErr) fail(`venda: ${vErr.message}`)
  ok('venda criada', vendaId)
  step('venda', { vendaId, vendaRes })

  const { data: vendaRow } = await admin
    .from('vendas')
    .select('id, status, total_liquido')
    .eq('id', vendaId)
    .single()
  if (vendaRow?.status !== 'CONCLUIDA') fail(`status venda=${vendaRow?.status}`)
  if (Number(vendaRow.total_liquido) !== VALOR) fail(`total_liquido=${vendaRow.total_liquido}`)

  const { data: pags } = await admin
    .from('vendas_pagamentos')
    .select('id, forma_pagamento, valor')
    .eq('venda_id', vendaId)
  if (!pags?.length) fail('pagamento não criado')
  if (pags[0].forma_pagamento !== 'DINHEIRO' || Number(pags[0].valor) !== VALOR) {
    fail(`pagamento inválido: ${JSON.stringify(pags)}`)
  }
  ok('pagamento criado', `${pags[0].forma_pagamento} ${pags[0].valor}`)
  step('pagamento', { pags })

  const { data: estoque } = await admin
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (Number(estoque?.quantidade_atual) !== 4) {
    fail(`estoque esperado 4, veio ${estoque?.quantidade_atual}`)
  }
  ok('estoque baixou', `5 → ${estoque.quantidade_atual}`)

  const esperadoDepois = await valorSistemaDinheiro(caixaId)
  const delta = esperadoDepois - esperadoAntes
  if (Math.abs(delta - VALOR) > 0.02) {
    fail(`esperado dinheiro delta=${delta}, queria +${VALOR} (antes=${esperadoAntes} depois=${esperadoDepois})`)
  }
  ok('caixa/turno reflete', `esperado ${esperadoAntes} → ${esperadoDepois} (Δ+${VALOR})`)
  step('esperado_depois', { esperadoDepois, delta })

  const { count: movCaixaDepois } = await admin
    .from('movimentacoes_caixa')
    .select('id', { count: 'exact', head: true })
    .eq('caixa_id', caixaId)
  const movDelta = (movCaixaDepois ?? 0) - (movCaixaAntes ?? 0)
  // Por desenho: venda NÃO cria sangria/suprimento
  if (movDelta !== 0) {
    console.warn(
      `WARN movimentacoes_caixa delta=${movDelta} (esperado 0 — venda não deve criar sangria/suprimento)`,
    )
  } else {
    ok('movimentacoes_caixa', 'inalterado (venda ≠ sangria/suprimento)')
  }
  step('movimentacoes_caixa', { movCaixaAntes, movCaixaDepois, movDelta })

  const { data: cr } = await admin
    .from('contas_receber')
    .select('id')
    .eq('venda_id', vendaId)
    .maybeSingle()
  if (cr?.id) fail('CR não deveria nascer em venda DINHEIRO integral')
  ok('sem contas_receber', 'venda à vista integral')

  report.verdict = 'GO'
  report.finishedAt = new Date().toISOString()
  const out = resolve('backend/artifacts', `missao4_1_ops_${stamp}.md`)
  writeFileSync(
    out,
    [
      '# Missão 4.1 — Financeiro nasce da venda',
      '',
      `**Veredito:** ${report.verdict}`,
      `**Venda:** \`${vendaId}\` · R$ ${VALOR} DINHEIRO`,
      `**Esperado caixa:** ${esperadoAntes} → ${esperadoDepois}`,
      `**Estoque:** 5 → 4`,
      `**movimentacoes_caixa Δ:** ${movDelta} (0 = alinhado ao desenho)`,
      '',
      '```json',
      JSON.stringify(report, null, 2),
      '```',
      '',
    ].join('\n'),
    'utf8',
  )
  console.log('REPORT', out)
  console.log('VERDICT GO 4.1')
}

main().catch((e) => fail(e?.stack || String(e)))
