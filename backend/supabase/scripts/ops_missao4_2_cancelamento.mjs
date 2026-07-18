/**
 * Missão 4.2 / 4.2.1 — Cancelamento (ADR-CAIXA-002 Modelo α).
 *
 * Asserts: venda +100 E(c); cancel → CANCELADA; VP preservado; estoque volta;
 * E(c) retorna ao pré-venda (Δ cancel = -100, sem double-count).
 * Não ajusta saldo_atual manualmente.
 *
 *   node --env-file=pdv-importados/.env.local backend/supabase/scripts/ops_missao4_2_cancelamento.mjs
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
  valor: VALOR,
  steps: [],
  bugs: [],
  notes: [],
}

function step(name, data) {
  report.steps.push({ name, ...data, at: new Date().toISOString() })
}

async function esperado(caixaId) {
  const { data, error } = await admin.rpc('calcular_valor_sistema_dinheiro_caixa', {
    p_caixa_id: caixaId,
  })
  if (error) fail(`esperado: ${error.message}`)
  return Number(data)
}

async function main() {
  const { data: gAuth, error: gErr } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  if (gErr || !gAuth.user) fail(`login gerente: ${gErr?.message}`)
  const gerenteId = gAuth.user.id
  ok('login gerente', gerenteId)

  const { data: uG } = await admin
    .from('usuarios')
    .select('loja_id, perfil')
    .eq('id', gerenteId)
    .single()
  const lojaId = uG.loja_id
  ok('gerente perfil', uG.perfil)

  const barcode = `7897${String(Date.now()).slice(-9)}`
  const { data: created, error: cErr } = await admin.rpc('criar_produto_com_estoque_inicial', {
    p_payload: {
      nome: `Missao4.2 Cancel ${stamp}`,
      codigo_barras: barcode,
      preco_varejo: VALOR,
      origem: 'china_manual',
      tem_nf: false,
      unidade_medida: 'UN',
      ativo: true,
      status_publicacao: 'PUBLICADO',
      estoque_inicial_quantidade: 10,
      estoque_inicial_minimo: 0,
    },
    p_ator_id: gerenteId,
    p_request_id: randomUUID(),
  })
  if (cErr) fail(`produto: ${cErr.message}`)
  const produtoId = created.produto_id
  ok('produto', produtoId)

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
    .select('id, saldo_atual, valor_inicial, status')
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
      .select('id, saldo_atual, valor_inicial, status')
      .single()
    if (aErr) fail(`abrir caixa: ${aErr.message}`)
    caixa = aberto
  }
  const caixaId = caixa.id
  const saldoAntesVenda = Number(caixa.saldo_atual ?? 0)
  ok('caixa', `${caixaId} saldo_atual=${saldoAntesVenda}`)
  step('caixa', { caixaId, saldoAntesVenda, valor_inicial: caixa.valor_inicial })

  const esperadoAntesVenda = await esperado(caixaId)
  ok('E(c) pré-venda', String(esperadoAntesVenda))
  step('esperado_antes_venda', { esperadoAntesVenda })
  const { data: est0 } = await admin
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .single()
  if (Number(est0.quantidade_atual) !== 10) fail(`estoque inicial ${est0.quantidade_atual}`)

  // --- 1) Venda ---
  const vendaId = randomUUID()
  const { error: vErr } = await opClient.rpc('finalizar_venda_transacional_canonica_v4', {
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
    p_user_agent: 'ops-missao4-2',
    p_device_id: 'ops-missao4-2',
    p_terminal_id: 'ops-script',
    p_cliente_id: null,
  })
  if (vErr) fail(`venda: ${vErr.message}`)
  ok('venda CONCLUIDA', vendaId)

  const { data: est1 } = await admin
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .single()
  if (Number(est1.quantidade_atual) !== 9) fail(`baixa estoque falhou: ${est1.quantidade_atual}`)
  ok('baixa estoque', '10 → 9')

  const { data: caixaPosVenda } = await admin
    .from('caixas')
    .select('saldo_atual')
    .eq('id', caixaId)
    .single()
  const saldoPosVenda = Number(caixaPosVenda.saldo_atual ?? 0)
  step('pos_venda', {
    estoque: est1.quantidade_atual,
    saldo_atual: saldoPosVenda,
    esperado: await esperado(caixaId),
  })
  if (saldoPosVenda === saldoAntesVenda) {
    notes.push(
      'finalizar_venda_v4 não altera caixas.saldo_atual (esperado). Cancel usa decremento best-effort; E(c) é SSoT.',
    )
    warn('saldo_atual pós-venda', `inalterado=${saldoPosVenda}`)
  }

  const esperadoPosVenda = await esperado(caixaId)
  const deltaVenda = esperadoPosVenda - esperadoAntesVenda
  ok('E(c) pós-venda', `${esperadoAntesVenda} → ${esperadoPosVenda} (Δ ${deltaVenda})`)
  if (Math.abs(deltaVenda - VALOR) > 0.02) {
    bugs.push({
      id: 'BUG-4.2.1-01',
      sev: 'P0',
      title: 'E(c) não subiu +P na venda DINHEIRO',
      detail: `Δ=${deltaVenda}, esperado +${VALOR}`,
    })
  }
  step('esperado_pos_venda', { esperadoAntesVenda, esperadoPosVenda, deltaVenda })

  // --- 2) Cancelamento (gerente, sem ajuste manual de saldo) ---
  const gerenteClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${gAuth.session.access_token}` } },
  })
  // re-login gerente (session may have been overwritten)
  const { data: gAuth2, error: gErr2 } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  if (gErr2) fail(`re-login gerente: ${gErr2.message}`)
  const gerenteClient2 = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${gAuth2.session.access_token}` } },
  })

  const motivo = `Missao4.2 cancel ops ${stamp}`
  const { data: cancelRes, error: cancelErr } = await gerenteClient2.rpc(
    'cancelar_venda_transacional',
    {
      p_venda_id: vendaId,
      p_motivo: motivo,
      p_operador_id: gerenteId,
    },
  )

  if (cancelErr) {
    const msg = cancelErr.message || String(cancelErr)
    step('cancelamento', { ok: false, error: msg })
    warn('cancelamento RPC', msg)

    if (msg.includes('CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE') || msg.includes('SALDO_CAIXA')) {
      bugs.push({
        id: 'BUG-4.2-01',
        sev: 'P0',
        title: 'Cancelamento DINHEIRO falha quando caixas.saldo_atual < estorno',
        detail:
          'cancelar_venda_transacional faz UPDATE caixas.saldo_atual -= valor_estornado com guard (saldo_atual - estorno) >= 0. ' +
          'finalizar_venda_transacional_canonica_v4 não incrementa saldo_atual. ' +
          `Neste teste: saldo_atual=${saldoPosVenda}, estorno=${VALOR}. ` +
          'Operação real de cancelamento DINHEIRO fica bloqueada sem intervenção manual no saldo.',
        evidence: msg,
      })
    } else {
      bugs.push({
        id: 'BUG-4.2-XX',
        sev: 'P0',
        title: 'Cancelamento falhou por motivo inesperado',
        detail: msg,
        evidence: msg,
      })
    }

    // Integridade: venda e estoque não devem ter sido alterados pela tentativa falha
    const { data: vStill } = await admin
      .from('vendas')
      .select('status')
      .eq('id', vendaId)
      .single()
    const { data: estStill } = await admin
      .from('estoque')
      .select('quantidade_atual')
      .eq('produto_id', produtoId)
      .eq('loja_id', lojaId)
      .single()
    if (vStill.status !== 'CONCLUIDA') {
      bugs.push({
        id: 'BUG-4.2-02',
        sev: 'P0',
        title: 'Venda mudou de status apesar de cancelamento falho',
        detail: `status=${vStill.status}`,
      })
    } else {
      ok('integridade TX', 'venda permanece CONCLUIDA após falha')
    }
    if (Number(estStill.quantidade_atual) !== 9) {
      bugs.push({
        id: 'BUG-4.2-03',
        sev: 'P0',
        title: 'Estoque alterado apesar de cancelamento falho',
        detail: `estoque=${estStill.quantidade_atual}`,
      })
    } else {
      ok('integridade estoque', 'permanece 9 após falha')
    }

    report.verdict = 'NO-GO'
    report.finishedAt = new Date().toISOString()
    report.bugs = bugs
    report.notes = notes
    writeReport(report)
    console.log('VERDICT NO-GO 4.2')
    console.log('BUGS', JSON.stringify(bugs, null, 2))
    process.exit(2)
  }

  // --- Cancel succeeded ---
  const cancelRow = Array.isArray(cancelRes) ? cancelRes[0] : cancelRes
  ok('cancelamento RPC', JSON.stringify(cancelRow))
  step('cancelamento', { ok: true, cancelRow })

  const { data: vCancel } = await admin
    .from('vendas')
    .select('id, status, total_liquido')
    .eq('id', vendaId)
    .single()
  if (vCancel.status !== 'CANCELADA') fail(`status=${vCancel.status}`)
  ok('status CANCELADA', vCancel.status)

  const { data: est2 } = await admin
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .single()
  if (Number(est2.quantidade_atual) !== 10) {
    fail(`estoque pós-cancel esperado 10, veio ${est2.quantidade_atual}`)
  }
  ok('estoque retornou', '9 → 10')

  const { data: repos } = await admin
    .from('estoque_reposicoes_cancelamento')
    .select('venda_id, produto_id, quantidade')
    .eq('venda_id', vendaId)
  if (!repos?.length) {
    bugs.push({
      id: 'BUG-4.2-04',
      sev: 'P1',
      title: 'Sem linha em estoque_reposicoes_cancelamento',
      detail: 'Kardex unificado usa esta tabela como ENTRADA_CANCELAMENTO_VENDA',
    })
  } else {
    ok('movimento inverso estoque', `reposicao qty=${repos[0].quantidade}`)
  }
  step('reposicao', { repos })

  const { data: melCancel } = await admin
    .from('movimentos_estoque_log')
    .select('id, tipo_codigo, quantidade_delta')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: false })
    .limit(5)
  const temLogFisicoEntrada = (melCancel || []).some(
    (m) => Number(m.quantidade_delta) > 0 && String(m.tipo_codigo).includes('CANCEL'),
  )
  if (!temLogFisicoEntrada) {
    notes.push(
      'Cancelamento NÃO grava ENTRADA em movimentos_estoque_log; trilha = estoque_reposicoes_cancelamento (+ v_kardex_unificado).',
    )
  }
  step('movimentos_estoque_log', { melCancel, temLogFisicoEntrada })

  const { data: devs } = await admin
    .from('devolucoes')
    .select('id, valor, forma_pagamento, motivo, operador_id')
    .eq('venda_id', vendaId)
  if (!devs?.length) {
    bugs.push({
      id: 'BUG-4.2-05',
      sev: 'P0',
      title: 'Sem devolucao registrada no cancelamento DINHEIRO',
    })
  } else {
    ok('devolucao', `${devs[0].forma_pagamento} ${devs[0].valor}`)
  }

  const { data: aud } = await admin
    .from('vendas_canceladas_auditoria')
    .select('venda_id, operador_id, motivo, forma_pagamento, valor_estornado, created_at')
    .eq('venda_id', vendaId)
    .maybeSingle()
  if (!aud) {
    bugs.push({
      id: 'BUG-4.2-06',
      sev: 'P0',
      title: 'Sem vendas_canceladas_auditoria',
    })
  } else {
    ok(
      'auditoria cancelamento',
      `operador=${aud.operador_id} valor_estornado=${aud.valor_estornado} quando=${aud.created_at}`,
    )
    if (aud.operador_id !== gerenteId) {
      notes.push(`auditoria.operador_id=${aud.operador_id} (ator cancel=${gerenteId})`)
    }
  }

  const { data: ev } = await admin
    .from('venda_eventos')
    .select('event_type, created_at, source')
    .eq('sale_id', vendaId)
    .eq('event_type', 'SALE_CANCELLED')
    .maybeSingle()
  if (!ev) {
    notes.push('venda_eventos SALE_CANCELLED não encontrado')
  } else {
    ok('evento SALE_CANCELLED', ev.created_at)
  }
  step('auditoria', { aud, ev, devs })

  // Histórico de pagamento NÃO deve ser apagado
  const { data: pags } = await admin
    .from('vendas_pagamentos')
    .select('id, valor')
    .eq('venda_id', vendaId)
  if (!pags?.length) {
    bugs.push({
      id: 'BUG-4.2-07',
      sev: 'P0',
      title: 'vendas_pagamentos apagado no cancelamento',
    })
  } else {
    ok('histórico pagamento preservado', `${pags.length} linha(s)`)
  }

  const esperadoPosCancel = await esperado(caixaId)
  const deltaEsperado = esperadoPosCancel - esperadoPosVenda
  const deltaCiclo = esperadoPosCancel - esperadoAntesVenda
  // ADR-CAIXA-002 Modelo α: Δ cancel = -P; E retorna ao pré-venda
  ok(
    'E(c) pós-cancel',
    `${esperadoPosVenda} → ${esperadoPosCancel} (Δ cancel ${deltaEsperado}; Δ ciclo ${deltaCiclo})`,
  )
  step('esperado_pos_cancel', {
    esperadoAntesVenda,
    esperadoPosVenda,
    esperadoPosCancel,
    deltaEsperado,
    deltaCiclo,
  })

  if (Math.abs(deltaEsperado + 2 * VALOR) <= 0.02) {
    bugs.push({
      id: 'BUG-4.2-09',
      sev: 'P0',
      title: 'Double-count no esperado após cancelamento (Modelo γ)',
      detail: `Δ=${deltaEsperado}; ADR exige Modelo α (Δ=-${VALOR}).`,
    })
  } else if (Math.abs(deltaEsperado + VALOR) > 0.02) {
    bugs.push({
      id: 'BUG-4.2-08',
      sev: 'P0',
      title: 'E(c) não reverteu -P no cancelamento',
      detail: `Δ cancel=${deltaEsperado}, esperado -${VALOR}`,
    })
  }
  if (Math.abs(deltaCiclo) > 0.02) {
    bugs.push({
      id: 'BUG-4.2.1-02',
      sev: 'P0',
      title: 'E(c) pós-cancel não voltou ao valor pré-venda',
      detail: `pré=${esperadoAntesVenda} pós=${esperadoPosCancel} Δciclo=${deltaCiclo}`,
    })
  } else {
    ok('E(c) ciclo', 'retornou ao pré-venda')
  }
  notes.push(
    'saldo_atual: decremento best-effort no cancel (não SSoT). E(c) = calcular_valor_sistema_dinheiro_caixa.',
  )

  const { data: caixaPosCancel } = await admin
    .from('caixas')
    .select('saldo_atual')
    .eq('id', caixaId)
    .single()
  step('saldo_atual_pos_cancel', { saldo: caixaPosCancel.saldo_atual })

  report.verdict = bugs.some((b) => b.sev === 'P0') ? 'NO-GO' : 'GO'
  report.finishedAt = new Date().toISOString()
  report.bugs = bugs
  report.notes = notes
  writeReport(report)
  console.log(`VERDICT ${report.verdict} 4.2`)
  if (bugs.length) console.log('BUGS', JSON.stringify(bugs, null, 2))
  if (notes.length) console.log('NOTES', notes)
  process.exit(report.verdict === 'GO' ? 0 : 2)
}

function writeReport(r) {
  const out = resolve('backend/artifacts', `missao4_2_1_ops_${stamp}.md`)
  const bugMd = (r.bugs || [])
    .map(
      (b) =>
        `### ${b.id} (${b.sev})\n\n**${b.title}**\n\n${b.detail || ''}\n\n\`\`\`\n${b.evidence || ''}\n\`\`\`\n`,
    )
    .join('\n')
  writeFileSync(
    out,
    [
      '# Missão 4.2.1 — Cancelamento ADR-CAIXA-002 (Modelo α)',
      '',
      `**Veredito:** ${r.verdict}`,
      `**Quando:** ${r.startedAt} → ${r.finishedAt}`,
      `**Valor:** R$ ${VALOR} DINHEIRO`,
      `**Migration:** \`20260718184800_adr_caixa_002_modelo_alpha_e_cancel.sql\``,
      `**RPCs:** \`calcular_valor_sistema_dinheiro_caixa\`, \`cancelar_venda_transacional\``,
      '',
      '## Resultado',
      '',
      '| Check | Status |',
      '|---|---|',
      ...r.steps.map((s) => `| ${s.name} | ${s.ok === false ? 'FAIL' : 'OK'} |`),
      '',
      '## Bugs reais (≠ ajuste de teste)',
      '',
      bugMd || '_Nenhum._',
      '',
      '## Notas de modelo',
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
