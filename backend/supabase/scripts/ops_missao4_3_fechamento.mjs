/**
 * Missão 4.3 — Fechamento de caixa (ADR-CAIXA-002).
 *
 * Fluxo: abrir → venda DINHEIRO R$100 → conferência E(c) → fechar_caixa_atomico.
 * Não altera saldo_atual. Não cria modelos financeiros novos.
 *
 *   node --env-file=pdv-importados/.env.local backend/supabase/scripts/ops_missao4_3_fechamento.mjs
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

const VALOR_VENDA = 100
const VALOR_INICIAL = 50
const bugs = []
const notes = []

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}
function ok(step, detail) {
  console.log(`OK  ${step}${detail ? ` — ${detail}` : ''}`)
}
function warn(step, detail) {
  console.log(`WARN ${step}${detail ? ` — ${detail}` : ''}`)
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
const report = {
  startedAt: new Date().toISOString(),
  valorVenda: VALOR_VENDA,
  valorInicial: VALOR_INICIAL,
  steps: [],
  bugs: [],
  notes: [],
}

function step(name, data) {
  report.steps.push({ name, at: new Date().toISOString(), ...data })
}

async function E(caixaId) {
  const { data, error } = await admin.rpc('calcular_valor_sistema_dinheiro_caixa', {
    p_caixa_id: caixaId,
  })
  if (error) fail(`E(c): ${error.message}`)
  return Number(data)
}

function clientWithToken(accessToken) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

async function main() {
  // --- Gerente: produto ---
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
  ok('login gerente', gerenteId)

  const barcode = `7893${String(Date.now()).slice(-9)}`
  const { data: created, error: cErr } = await admin.rpc('criar_produto_com_estoque_inicial', {
    p_payload: {
      nome: `Missao4.3 Fechamento ${stamp}`,
      codigo_barras: barcode,
      preco_varejo: VALOR_VENDA,
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
  if (cErr) fail(`produto: ${cErr.message}`)
  const produtoId = created.produto_id
  ok('produto', produtoId)
  step('produto', { produtoId, barcode })

  // --- Operador ---
  const { data: opAuth, error: oErr } = await authClient.auth.signInWithPassword({
    email: operadorEmail,
    password,
  })
  if (oErr || !opAuth.user) fail(`login operador: ${oErr?.message}`)
  const operadorId = opAuth.user.id
  const opClient = clientWithToken(opAuth.session.access_token)
  ok('login operador', operadorId)

  // Fecha caixa aberto pré-existente (precondição) para isolar o ciclo
  const { data: abertoPrev } = await opClient
    .from('caixas')
    .select('id, status, valor_inicial, saldo_atual')
    .eq('operador_id', operadorId)
    .eq('status', 'ABERTO')
    .order('data_abertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (abertoPrev?.id) {
    const ePrev = await E(abertoPrev.id)
    warn('precondição', `caixa aberto ${abertoPrev.id} E=${ePrev} — fechando para isolar 4.3`)
    const { error: preCloseErr } = await opClient.rpc('fechar_caixa_atomico', {
      p_operador_id: operadorId,
      p_valor_contado: ePrev,
      p_motivo: 'Missao4.3 precondicao isolar turno',
    })
    if (preCloseErr) {
      bugs.push({
        id: 'BUG-4.3-00',
        sev: 'P0',
        title: 'Não foi possível fechar caixa pré-existente para isolar o teste',
        detail: preCloseErr.message,
      })
      report.verdict = 'NO-GO'
      report.finishedAt = new Date().toISOString()
      report.bugs = bugs
      writeReport(report)
      process.exit(2)
    }
    ok('precondição', 'caixa anterior FECHADO')
    step('precondicao_fecha', { caixaId: abertoPrev.id, E: ePrev })
  }

  // --- 1) Abertura ---
  const { data: novoCaixa, error: openErr } = await opClient
    .from('caixas')
    .insert({
      operador_id: operadorId,
      loja_id: lojaId,
      valor_inicial: VALOR_INICIAL,
      status: 'ABERTO',
      data_abertura: new Date().toISOString(),
    })
    .select('id, status, valor_inicial, saldo_atual, data_abertura')
    .single()
  if (openErr) fail(`abrir caixa: ${openErr.message}`)
  const caixaId = novoCaixa.id
  const saldoAbertura = Number(novoCaixa.saldo_atual ?? 0)
  ok('abertura', `${caixaId} VI=${novoCaixa.valor_inicial} saldo_atual=${saldoAbertura}`)
  step('abertura', {
    caixaId,
    valor_inicial: Number(novoCaixa.valor_inicial),
    saldo_atual: saldoAbertura,
    status: novoCaixa.status,
  })
  if (saldoAbertura !== 0) {
    notes.push(`saldo_atual na abertura=${saldoAbertura} (default esperado 0; não é SSoT de E)`)
  }

  const eAbertura = await E(caixaId)
  ok('E(c) pós-abertura', String(eAbertura))
  if (Math.abs(eAbertura - VALOR_INICIAL) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-01',
      sev: 'P0',
      title: 'E(c) pós-abertura ≠ valor_inicial',
      detail: `E=${eAbertura} VI=${VALOR_INICIAL}`,
    })
  }
  step('esperado_abertura', { eAbertura, esperado: VALOR_INICIAL })

  // --- 2) Venda DINHEIRO ---
  const vendaId = randomUUID()
  const { error: vErr } = await opClient.rpc('finalizar_venda_transacional_canonica_v4', {
    p_venda_id: vendaId,
    p_caixa_id: caixaId,
    p_operador_id: operadorId,
    p_loja_id: lojaId,
    p_forma_pagamento: 'DINHEIRO',
    p_total_bruto: VALOR_VENDA,
    p_total_desconto: 0,
    p_total_liquido: VALOR_VENDA,
    p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: VALOR_VENDA }],
    p_itens: [
      {
        item_id: randomUUID(),
        produto_id: produtoId,
        quantidade: 1,
        preco_original: VALOR_VENDA,
        preco_unitario: VALOR_VENDA,
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
    p_user_agent: 'ops-missao4-3',
    p_device_id: 'ops-missao4-3',
    p_terminal_id: 'ops-script',
    p_cliente_id: null,
  })
  if (vErr) fail(`venda: ${vErr.message}`)
  ok('venda CONCLUIDA', vendaId)

  const { data: vp } = await admin
    .from('vendas_pagamentos')
    .select('forma_pagamento, valor')
    .eq('venda_id', vendaId)
  if (!vp?.length || Number(vp[0].valor) !== VALOR_VENDA) {
    bugs.push({
      id: 'BUG-4.3-02',
      sev: 'P0',
      title: 'vendas_pagamentos ausente ou valor incorreto',
      detail: JSON.stringify(vp),
    })
  } else {
    ok('vendas_pagamentos', `${vp[0].forma_pagamento} ${vp[0].valor}`)
  }
  step('venda', { vendaId, pagamentos: vp })

  const { data: caixaPosVenda } = await admin
    .from('caixas')
    .select('saldo_atual, status')
    .eq('id', caixaId)
    .single()
  if (Number(caixaPosVenda.saldo_atual) !== saldoAbertura) {
    notes.push(
      `saldo_atual mudou na venda (${saldoAbertura}→${caixaPosVenda.saldo_atual}) — fora do escopo 4.3; E(c) permanece SSoT`,
    )
  } else {
    ok('saldo_atual inalterado na venda', String(caixaPosVenda.saldo_atual))
  }

  const ePosVenda = await E(caixaId)
  const deltaVenda = ePosVenda - eAbertura
  ok('E(c) pós-venda', `${eAbertura} → ${ePosVenda} (Δ ${deltaVenda})`)
  if (Math.abs(deltaVenda - VALOR_VENDA) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-03',
      sev: 'P0',
      title: 'E(c) não refletiu +P da venda DINHEIRO',
      detail: `Δ=${deltaVenda}`,
    })
  }
  const eEsperadoFechamento = VALOR_INICIAL + VALOR_VENDA
  if (Math.abs(ePosVenda - eEsperadoFechamento) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-04',
      sev: 'P0',
      title: 'E(c) ≠ VI + venda (ciclo isolado)',
      detail: `E=${ePosVenda} esperado ${eEsperadoFechamento}`,
    })
  }
  step('esperado_pos_venda', { eAbertura, ePosVenda, deltaVenda, eEsperadoFechamento })

  // --- 3) Conferência (valor contado = E) ---
  const valorContado = ePosVenda
  const diferencaConferencia = Round2(valorContado - ePosVenda)
  ok('conferência', `contado=${valorContado} sistema=${ePosVenda} diff=${diferencaConferencia}`)
  if (Math.abs(diferencaConferencia) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-05',
      sev: 'P0',
      title: 'Conferência pré-fechamento inconsistente',
      detail: `diff=${diferencaConferencia}`,
    })
  }
  step('conferencia', { valorContado, ePosVenda, diferencaConferencia })

  // --- 4) Fechamento ---
  const { data: closeRes, error: closeErr } = await opClient.rpc('fechar_caixa_atomico', {
    p_operador_id: operadorId,
    p_valor_contado: valorContado,
    p_motivo: '',
  })
  if (closeErr) {
    bugs.push({
      id: 'BUG-4.3-06',
      sev: 'P0',
      title: 'fechar_caixa_atomico falhou',
      detail: closeErr.message,
      evidence: closeErr.message,
    })
    step('fechamento', { ok: false, error: closeErr.message })
    report.verdict = 'NO-GO'
    finish()
    process.exit(2)
  }

  const closeRow = Array.isArray(closeRes) ? closeRes[0] : closeRes
  ok(
    'fechamento RPC',
    `sistema=${closeRow.o_valor_sistema} contado=${closeRow.o_valor_contado} diff=${closeRow.o_diferenca}`,
  )
  step('fechamento', { ok: true, closeRow })

  if (String(closeRow.o_caixa_id) !== caixaId) {
    bugs.push({
      id: 'BUG-4.3-07',
      sev: 'P0',
      title: 'RPC fechou caixa diferente do turno isolado',
      detail: `esperado ${caixaId} veio ${closeRow.o_caixa_id}`,
    })
  }
  if (Math.abs(Number(closeRow.o_valor_sistema) - ePosVenda) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-08',
      sev: 'P0',
      title: 'o_valor_sistema ≠ E(c) pré-fechamento',
      detail: `rpc=${closeRow.o_valor_sistema} E=${ePosVenda}`,
    })
  }
  if (Math.abs(Number(closeRow.o_diferenca)) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-09',
      sev: 'P0',
      title: 'Diferença de fechamento ≠ 0 no happy path',
      detail: `diff=${closeRow.o_diferenca}`,
    })
  }

  const { data: caixaFechado } = await admin
    .from('caixas')
    .select(
      'id, status, valor_inicial, saldo_atual, valor_fechamento, fechamento_diferenca, fechamento_observacao, data_fechamento',
    )
    .eq('id', caixaId)
    .single()

  if (caixaFechado.status !== 'FECHADO') {
    bugs.push({
      id: 'BUG-4.3-10',
      sev: 'P0',
      title: 'status não é FECHADO',
      detail: caixaFechado.status,
    })
  } else {
    ok('status FECHADO', caixaFechado.data_fechamento)
  }
  if (Math.abs(Number(caixaFechado.valor_fechamento) - valorContado) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-11',
      sev: 'P0',
      title: 'valor_fechamento ≠ valor contado',
      detail: String(caixaFechado.valor_fechamento),
    })
  }
  if (Math.abs(Number(caixaFechado.fechamento_diferenca ?? 0)) > 0.02) {
    bugs.push({
      id: 'BUG-4.3-12',
      sev: 'P0',
      title: 'fechamento_diferenca persistido ≠ 0',
      detail: String(caixaFechado.fechamento_diferenca),
    })
  }

  // saldo_atual não é critério de fechamento
  notes.push(
    `saldo_atual ao fechar=${caixaFechado.saldo_atual} (não usado na conferência; SSoT=E(c)=${closeRow.o_valor_sistema})`,
  )
  step('caixa_fechado', { caixaFechado })

  // Pós-fechamento: nova venda no mesmo caixa deve falhar (imutabilidade)
  const vendaApos = randomUUID()
  const { error: afterErr } = await opClient.rpc('finalizar_venda_transacional_canonica_v4', {
    p_venda_id: vendaApos,
    p_caixa_id: caixaId,
    p_operador_id: operadorId,
    p_loja_id: lojaId,
    p_forma_pagamento: 'DINHEIRO',
    p_total_bruto: VALOR_VENDA,
    p_total_desconto: 0,
    p_total_liquido: VALOR_VENDA,
    p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: VALOR_VENDA }],
    p_itens: [
      {
        item_id: randomUUID(),
        produto_id: produtoId,
        quantidade: 1,
        preco_original: VALOR_VENDA,
        preco_unitario: VALOR_VENDA,
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
    p_user_agent: 'ops-missao4-3-after',
    p_device_id: 'ops-missao4-3',
    p_terminal_id: 'ops-script',
    p_cliente_id: null,
  })
  if (!afterErr) {
    bugs.push({
      id: 'BUG-4.3-13',
      sev: 'P0',
      title: 'Venda aceita em caixa FECHADO',
      detail: vendaApos,
    })
  } else {
    ok('imutabilidade pós-fecha', afterErr.message.slice(0, 80))
  }
  step('venda_apos_fechamento', { blocked: Boolean(afterErr), error: afterErr?.message })

  report.verdict = bugs.some((b) => b.sev === 'P0') ? 'NO-GO' : 'GO'
  finish()
  console.log(`VERDICT ${report.verdict} 4.3`)
  if (bugs.length) console.log('BUGS', JSON.stringify(bugs, null, 2))
  if (notes.length) console.log('NOTES', notes)
  process.exit(report.verdict === 'GO' ? 0 : 2)
}

function Round2(n) {
  return Math.round(n * 100) / 100
}

function finish() {
  report.finishedAt = new Date().toISOString()
  report.bugs = bugs
  report.notes = notes
  writeReport(report)
}

function writeReport(r) {
  const out = resolve('backend/artifacts', `missao4_3_ops_${stamp}.md`)
  const bugMd = (r.bugs || [])
    .map(
      (b) =>
        `### ${b.id} (${b.sev})\n\n**${b.title}**\n\n${b.detail || ''}\n\n\`\`\`\n${b.evidence || ''}\n\`\`\`\n`,
    )
    .join('\n')
  writeFileSync(
    out,
    [
      '# Missão 4.3 — Fechamento de caixa (ADR-CAIXA-002)',
      '',
      `**Veredito:** ${r.verdict}`,
      `**Quando:** ${r.startedAt} → ${r.finishedAt}`,
      `**Contrato:** E(c) = \`calcular_valor_sistema_dinheiro_caixa\` · fechamento via \`fechar_caixa_atomico\``,
      `**Ciclo:** abertura VI=${VALOR_INICIAL} → venda DINHEIRO R$${VALOR_VENDA} → conferência → fechar`,
      '',
      '## Matriz',
      '',
      '| Check | Status |',
      '|---|---|',
      ...r.steps.map((s) => `| ${s.name} | ${s.ok === false ? 'FAIL' : 'OK'} |`),
      '',
      '## Bugs reais',
      '',
      bugMd || '_Nenhum._',
      '',
      '## Notas',
      '',
      ...(r.notes || []).map((n) => `- ${n}`),
      '',
      '## Raw',
      '',
      '```json',
      JSON.stringify(r, null, 2),
      '```',
      '',
    ].join('\n'),
    'utf8',
  )
  console.log('REPORT', out)
}

main().catch((e) => fail(e?.stack || String(e)))
