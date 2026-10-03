/**
 * Teste operacional Missão 3.1 — cadastro → estoque → venda → pós-venda.
 * Uso (na raiz ou pdv-importados, com .env.local):
 *   node --env-file=pdv-importados/.env.local backend/supabase/scripts/ops_missao3_cadastro_venda.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL

if (process.env.ALLOW_NONLOCAL_SUPABASE_SCRIPT !== '1' && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  console.error(`RECUSADO: alvo não local; este script não pode rodar contra produção. URL=${url}`)
  process.exit(2)
}
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

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}

function ok(step, detail) {
  console.log(`OK  ${step}${detail ? ` — ${detail}` : ''}`)
}

if (!url || !serviceKey || !anonKey || !gerenteEmail || !operadorEmail || !password) {
  fail('Missing env: URL, SERVICE_ROLE, ANON, emails, password')
}

/** service_role puro — nunca fazer signIn neste client (senão perde o role). */
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const barcode = `7899${String(Date.now()).slice(-9)}`
const requestId = randomUUID()
const report = {
  startedAt: new Date().toISOString(),
  barcode,
  requestId,
  steps: [],
}

function step(name, data) {
  report.steps.push({ name, ...data, at: new Date().toISOString() })
}

async function main() {
  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: gerenteAuth, error: gErr } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  if (gErr || !gerenteAuth.user) fail(`login gerente: ${gErr?.message}`)
  const gerenteId = gerenteAuth.user.id
  ok('login gerente', gerenteId)

  const { data: uGerente, error: ugErr } = await admin
    .from('usuarios')
    .select('id, perfil, loja_id')
    .eq('id', gerenteId)
    .single()
  if (ugErr) fail(`usuarios gerente: ${ugErr.message}`)
  const lojaId = uGerente.loja_id
  ok('loja', lojaId)

  let categoriaId = null
  const { data: cats } = await admin.from('categorias').select('id, nome').limit(1)
  if (cats?.[0]?.id) categoriaId = cats[0].id

  const payload = {
    nome: `Missao3 Ops Produto A ${stamp}`,
    codigo_barras: barcode,
    preco_varejo: 10,
    preco_atacado: 8,
    quantidade_gatilho_atacado: 10,
    origem: 'china_manual',
    tem_nf: false,
    unidade_medida: 'UN',
    categoria_id: categoriaId,
    ativo: true,
    status_publicacao: 'PUBLICADO',
    estoque_inicial_quantidade: 10,
    estoque_inicial_minimo: 2,
  }

  const { data: created, error: cErr } = await admin.rpc('criar_produto_com_estoque_inicial', {
    p_payload: payload,
    p_ator_id: gerenteId,
    p_request_id: requestId,
  })
  if (cErr) fail(`criar_produto_com_estoque_inicial: ${cErr.message}`)
  const produtoId = created?.produto_id || created?.produtoId
  if (!produtoId) fail(`sem produto_id na resposta: ${JSON.stringify(created)}`)
  ok('cadastro produto', produtoId)
  step('cadastro', { produtoId, created })

  const { data: estoqueAntes, error: eErr } = await admin
    .from('estoque')
    .select('produto_id, quantidade_atual, estoque_minimo')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (eErr) fail(`estoque: ${eErr.message}`)
  const qtyAntes = Number(estoqueAntes?.quantidade_atual)
  if (qtyAntes !== 10) fail(`estoque esperado 10, veio ${qtyAntes}`)
  ok('estoque inicial', String(qtyAntes))
  step('estoque_inicial', { estoqueAntes })

  const { data: movs, error: mErr } = await admin
    .from('movimentos_estoque_log')
    .select('id, tipo_codigo, quantidade_delta, observacao, usuario_id, created_at')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (mErr) fail(`movimentos: ${mErr.message}`)
  if (!movs?.length) fail('sem histórico em movimentos_estoque_log')
  ok('histórico estoque', `${movs.length} movimento(s)`)
  step('historico', { movs })

  const { data: opAuth, error: oErr } = await authClient.auth.signInWithPassword({
    email: operadorEmail,
    password,
  })
  if (oErr || !opAuth.user) fail(`login operador: ${oErr?.message}`)
  const operadorId = opAuth.user.id
  ok('login operador', operadorId)

  const opClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${opAuth.session.access_token}` },
    },
  })

  const { data: caixaExistente } = await opClient
    .from('caixas')
    .select('id')
    .eq('operador_id', operadorId)
    .eq('status', 'ABERTO')
    .order('data_abertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  let caixaId = caixaExistente?.id ?? null
  if (!caixaId) {
    const { data: aberto, error: aErr } = await opClient
      .from('caixas')
      .insert({
        loja_id: lojaId,
        operador_id: operadorId,
        status: 'ABERTO',
        valor_inicial: 100,
        data_abertura: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (aErr || !aberto?.id) fail(`abrir caixa: ${aErr?.message}`)
    caixaId = aberto.id
    ok('caixa aberto', caixaId)
  } else {
    ok('caixa já aberto', caixaId)
  }
  step('caixa', { caixaId })

  const vendaId = randomUUID()
  const itemId = randomUUID()
  const { data: venda, error: vErr } = await opClient.rpc(
    'finalizar_venda_transacional_canonica_v4',
    {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_forma_pagamento: 'DINHEIRO',
      p_total_bruto: 10,
      p_total_desconto: 0,
      p_total_liquido: 10,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 10 }],
      p_itens: [
        {
          item_id: itemId,
          produto_id: produtoId,
          quantidade: 1,
          preco_original: 10,
          preco_unitario: 10,
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
      p_user_agent: 'ops-missao3',
      p_device_id: 'ops-missao3',
      p_terminal_id: 'ops-script',
      p_cliente_id: null,
    },
  )
  if (vErr) fail(`finalizar_venda_transacional_canonica_v4: ${vErr.message}`)
  step('venda', { venda, vendaId })
  ok('venda', vendaId)

  const { data: estoqueDepois, error: edErr } = await admin
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (edErr) fail(`estoque pós: ${edErr.message}`)
  const qtyDepois = Number(estoqueDepois?.quantidade_atual)
  if (qtyDepois !== 9) fail(`estoque pós esperado 9, veio ${qtyDepois}`)
  ok('baixa estoque', `10 → ${qtyDepois}`)
  step('estoque_pos', { qtyDepois })

  let pagamentos = []
  if (vendaId) {
    const { data: pags } = await admin
      .from('vendas_pagamentos')
      .select('id, forma_pagamento, valor, venda_id')
      .eq('venda_id', vendaId)
    pagamentos = pags || []
    if (!pagamentos.length) fail('nenhum pagamento registrado')
    ok('pagamento', `${pagamentos.length} linha(s)`)
  } else {
    ok('pagamento', 'venda_id não retornado — ver payload venda no report')
  }
  step('pagamentos', { vendaId, pagamentos })

  const { data: movsPos } = await admin
    .from('movimentos_estoque_log')
    .select('id, tipo_codigo, quantidade_delta, created_at')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: false })
    .limit(5)
  step('auditoria_estoque', { movsPos })
  ok('auditoria estoque', `${movsPos?.length ?? 0} movimento(s)`)

  report.verdict = 'GO'
  report.finishedAt = new Date().toISOString()
  const out = resolve(
    'backend/artifacts',
    `missao3_ops_3_1_${stamp}.md`,
  )
  const md = [
    '# Missão 3.1 — Teste operacional (cadastro → venda)',
    '',
    `**Veredito:** ${report.verdict}`,
    `**Quando:** ${report.startedAt} → ${report.finishedAt}`,
    `**Produto:** \`${produtoId}\` barcode \`${barcode}\``,
    `**Estoque:** 10 → ${qtyDepois}`,
    `**Venda:** \`${vendaId ?? 'n/a'}\``,
    '',
    '## Passos',
    '',
    '```json',
    JSON.stringify(report.steps, null, 2),
    '```',
    '',
  ].join('\n')
  writeFileSync(out, md, 'utf8')
  console.log('REPORT', out)
  console.log('VERDICT GO')
}

main().catch((e) => fail(e?.stack || String(e)))
