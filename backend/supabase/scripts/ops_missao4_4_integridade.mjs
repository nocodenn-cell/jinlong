/**
 * Missão 4.4 — Integridade Cross-Entity (Venda → Estoque → Pagamento → Caixa).
 *
 * Não cria regras novas. Não altera saldo_atual. Não refatora.
 *
 *   node --env-file=pdv-importados/.env.local backend/supabase/scripts/ops_missao4_4_integridade.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL

// Guard de ambiente (go-live), mesmo padrão de backend/scripts/fallback-sem-rpc-real.mjs:
// o projeto Supabase é único (produção = Preview = E2E); este script grava dados e só
// roda em localhost/127.0.0.1, antes de qualquer conexão.
if (url && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  console.error(`RECUSADO: o alvo não é local; este script grava dados e não pode rodar contra produção. URL=${url}`)
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

const VALOR = 100
const bugs = []
const notes = []
const checks = []

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}
function ok(step, detail) {
  console.log(`OK  ${step}${detail ? ` — ${detail}` : ''}`)
  checks.push({ step, ok: true, detail })
}
function bad(step, detail) {
  console.log(`BAD ${step}${detail ? ` — ${detail}` : ''}`)
  checks.push({ step, ok: false, detail })
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
const report = { startedAt: new Date().toISOString(), valor: VALOR }

function clientWithToken(token) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

async function E(caixaId) {
  const { data, error } = await admin.rpc('calcular_valor_sistema_dinheiro_caixa', {
    p_caixa_id: caixaId,
  })
  if (error) fail(`E(c): ${error.message}`)
  return Number(data)
}

function baseVendaPayload({
  vendaId,
  caixaId,
  operadorId,
  lojaId,
  produtoId,
  pagamentos,
}) {
  return {
    p_venda_id: vendaId,
    p_caixa_id: caixaId,
    p_operador_id: operadorId,
    p_loja_id: lojaId,
    p_forma_pagamento: 'DINHEIRO',
    p_total_bruto: VALOR,
    p_total_desconto: 0,
    p_total_liquido: VALOR,
    p_pagamentos: pagamentos,
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
    p_user_agent: 'ops-missao4-4',
    p_device_id: 'ops-missao4-4',
    p_terminal_id: 'ops-script',
    p_cliente_id: null,
  }
}

async function estoqueQty(produtoId, lojaId) {
  const { data } = await admin
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .single()
  return Number(data.quantidade_atual)
}

async function main() {
  const { data: gAuth, error: gErr } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  if (gErr || !gAuth.user) fail(`login gerente: ${gErr?.message}`)
  const gerenteId = gAuth.user.id
  const gerenteClient = clientWithToken(gAuth.session.access_token)
  const { data: uG } = await admin.from('usuarios').select('loja_id').eq('id', gerenteId).single()
  const lojaId = uG.loja_id

  const barcode = `7894${String(Date.now()).slice(-9)}`
  const { data: created, error: cErr } = await admin.rpc('criar_produto_com_estoque_inicial', {
    p_payload: {
      nome: `Missao4.4 Integridade ${stamp}`,
      codigo_barras: barcode,
      preco_varejo: VALOR,
      origem: 'china_manual',
      tem_nf: false,
      unidade_medida: 'UN',
      ativo: true,
      status_publicacao: 'PUBLICADO',
      estoque_inicial_quantidade: 20,
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
  const opClient = clientWithToken(opAuth.session.access_token)

  let { data: caixa } = await opClient
    .from('caixas')
    .select('id, status, saldo_atual')
    .eq('operador_id', operadorId)
    .eq('status', 'ABERTO')
    .order('data_abertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!caixa?.id) {
    const { data: aberto, error: aErr } = await opClient
      .from('caixas')
      .insert({
        operador_id: operadorId,
        loja_id: lojaId,
        valor_inicial: 0,
        status: 'ABERTO',
        data_abertura: new Date().toISOString(),
      })
      .select('id, status, saldo_atual')
      .single()
    if (aErr) fail(`abrir caixa: ${aErr.message}`)
    caixa = aberto
  }
  const caixaId = caixa.id
  ok('caixa', caixaId)

  const est0 = await estoqueQty(produtoId, lojaId)
  if (est0 !== 20) fail(`estoque inicial ${est0}`)

  // -------------------------------------------------------------------------
  // 1) Venda sem pagamento (array vazio)
  // -------------------------------------------------------------------------
  {
    const { error } = await opClient.rpc(
      'finalizar_venda_transacional_canonica_v4',
      baseVendaPayload({
        vendaId: randomUUID(),
        caixaId,
        operadorId,
        lojaId,
        produtoId,
        pagamentos: [],
      }),
    )
    const msg = error?.message || ''
    if (
      msg.includes('PAGAMENTOS_INVALIDOS') ||
      msg.includes('PAGAMENTO_ZERO') ||
      msg.includes('VALOR_PAGAMENTO_INVALIDO')
    ) {
      ok('venda_sem_pagamento_array_vazio', msg)
    } else if (!error) {
      bugs.push({
        id: 'BUG-4.4-01',
        sev: 'P0',
        title: 'Venda aceita com p_pagamentos=[]',
        detail: 'Esperado FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INVALIDOS',
      })
      bad('venda_sem_pagamento_array_vazio', 'aceitou')
    } else {
      bugs.push({
        id: 'BUG-4.4-01b',
        sev: 'P1',
        title: 'Venda sem pagamento rejeitada com código inesperado',
        detail: msg,
        evidence: msg,
      })
      bad('venda_sem_pagamento_array_vazio', msg)
    }
  }

  // 1b) pagamento zero
  {
    const { error } = await opClient.rpc(
      'finalizar_venda_transacional_canonica_v4',
      baseVendaPayload({
        vendaId: randomUUID(),
        caixaId,
        operadorId,
        lojaId,
        produtoId,
        pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 0 }],
      }),
    )
    const msg = error?.message || ''
    if (msg.includes('VALOR_PAGAMENTO_INVALIDO') || msg.includes('PAGAMENTO_ZERO')) {
      ok('venda_pagamento_zero', msg)
    } else if (!error) {
      bugs.push({
        id: 'BUG-4.4-02',
        sev: 'P0',
        title: 'Venda aceita com pagamento valor 0',
      })
      bad('venda_pagamento_zero', 'aceitou')
    } else {
      bugs.push({
        id: 'BUG-4.4-02b',
        sev: 'P1',
        title: 'Pagamento zero rejeitado com código inesperado',
        detail: msg,
        evidence: msg,
      })
      bad('venda_pagamento_zero', msg)
    }
  }

  if ((await estoqueQty(produtoId, lojaId)) !== est0) {
    bugs.push({
      id: 'BUG-4.4-03',
      sev: 'P0',
      title: 'Estoque alterado após tentativas de venda inválida',
      detail: `estoque=${await estoqueQty(produtoId, lojaId)}`,
    })
    bad('estoque_apos_negativos', 'mudou')
  } else {
    ok('estoque_apos_negativos', `permanece ${est0}`)
  }

  // -------------------------------------------------------------------------
  // 2) Pagamento sem venda (FK)
  // -------------------------------------------------------------------------
  {
    const fakeVendaId = randomUUID()
    const { error } = await admin.from('vendas_pagamentos').insert({
      venda_id: fakeVendaId,
      forma_pagamento: 'DINHEIRO',
      valor: VALOR,
    })
    const msg = error?.message || ''
    if (
      msg.toLowerCase().includes('foreign key') ||
      msg.includes('vendas_pagamentos_venda_id_fkey') ||
      msg.includes('23503')
    ) {
      ok('pagamento_sem_venda', msg.slice(0, 120))
    } else if (!error) {
      bugs.push({
        id: 'BUG-4.4-04',
        sev: 'P0',
        title: 'INSERT vendas_pagamentos sem venda pai aceito',
        detail: fakeVendaId,
      })
      bad('pagamento_sem_venda', 'aceitou')
      await admin.from('vendas_pagamentos').delete().eq('venda_id', fakeVendaId)
    } else {
      // RLS ou outro bloqueio também OK para integridade
      ok('pagamento_sem_venda', `bloqueado: ${msg.slice(0, 120)}`)
      notes.push(`pagamento_sem_venda bloqueado por: ${msg}`)
    }
  }

  // -------------------------------------------------------------------------
  // 3–5) Ciclo feliz + cancel duplicado + estoque + auditoria
  // -------------------------------------------------------------------------
  const eAntes = await E(caixaId)
  const vendaId = randomUUID()
  const { error: vErr } = await opClient.rpc(
    'finalizar_venda_transacional_canonica_v4',
    baseVendaPayload({
      vendaId,
      caixaId,
      operadorId,
      lojaId,
      produtoId,
      pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: VALOR }],
    }),
  )
  if (vErr) fail(`venda happy: ${vErr.message}`)
  ok('venda_happy', vendaId)

  const est1 = await estoqueQty(produtoId, lojaId)
  if (est1 !== est0 - 1) {
    bugs.push({
      id: 'BUG-4.4-05',
      sev: 'P0',
      title: 'Baixa de estoque incorreta na venda',
      detail: `${est0}→${est1}`,
    })
    bad('estoque_pos_venda', `${est0}→${est1}`)
  } else {
    ok('estoque_pos_venda', `${est0}→${est1}`)
  }

  const { data: vp } = await admin
    .from('vendas_pagamentos')
    .select('id, valor, forma_pagamento')
    .eq('venda_id', vendaId)
  if (!vp?.length) {
    bugs.push({ id: 'BUG-4.4-06', sev: 'P0', title: 'Venda CONCLUIDA sem vendas_pagamentos' })
    bad('pagamento_pos_venda', 'ausente')
  } else {
    ok('pagamento_pos_venda', `${vp[0].forma_pagamento} ${vp[0].valor}`)
  }

  const ePos = await E(caixaId)
  if (Math.abs(ePos - eAntes - VALOR) > 0.02) {
    bugs.push({
      id: 'BUG-4.4-07',
      sev: 'P0',
      title: 'E(c) não refletiu venda',
      detail: `${eAntes}→${ePos}`,
    })
    bad('E_pos_venda', `${eAntes}→${ePos}`)
  } else {
    ok('E_pos_venda', `Δ +${VALOR}`)
  }

  // Consistência / auditoria da venda CONCLUIDA
  const { data: consRaw, error: consErr } = await admin.rpc('verificar_consistencia_venda', {
    p_venda_id: vendaId,
  })
  if (consErr) {
    notes.push(`verificar_consistencia_venda erro: ${consErr.message}`)
    warn('consistencia_venda', consErr.message)
  } else {
    const cons = Array.isArray(consRaw) ? consRaw[0] : consRaw
    ok(
      'consistencia_venda_rpc',
      `consistente=${cons.consistente} anomalias=${JSON.stringify(cons.anomalias)}`,
    )
    if (cons.consistente === false) {
      const anoms = cons.anomalias || []
      if (anoms.includes('sem_pagamento') || anoms.includes('pagamentos_divergentes')) {
        bugs.push({
          id: 'BUG-4.4-08',
          sev: 'P0',
          title: 'Consistência pagamento falhou em venda happy-path',
          detail: JSON.stringify(anoms),
        })
      }
      if (anoms.includes('sem_evento_ledger')) {
        bugs.push({
          id: 'BUG-4.4-09',
          sev: 'P1',
          title: 'SALE_REGISTERED ausente após finalizar_venda_v4',
          detail:
            'verificar_consistencia_venda exige event_type=SALE_REGISTERED; v4 live não grava venda_eventos na finalização.',
          evidence: JSON.stringify(anoms),
        })
      }
      if (anoms.includes('sem_itens')) {
        bugs.push({
          id: 'BUG-4.4-10',
          sev: 'P0',
          title: 'Venda sem itens',
          detail: JSON.stringify(anoms),
        })
      }
    }
  }

  const { data: evReg } = await admin
    .from('venda_eventos')
    .select('event_type, occurred_at, source')
    .eq('sale_id', vendaId)
    .eq('event_type', 'SALE_REGISTERED')
    .maybeSingle()
  if (!evReg) {
    notes.push('venda_eventos SALE_REGISTERED não encontrado (alinha BUG-4.4-09 se consistency falhou)')
    warn('auditoria_SALE_REGISTERED', 'ausente')
  } else {
    ok('auditoria_SALE_REGISTERED', evReg.occurred_at)
  }

  // Cancel 1
  const { data: gAuth2 } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  const gerenteClient2 = clientWithToken(gAuth2.session.access_token)
  const { error: cancel1Err } = await gerenteClient2.rpc('cancelar_venda_transacional', {
    p_venda_id: vendaId,
    p_motivo: `Missao4.4 cancel ${stamp}`,
    p_operador_id: gerenteId,
  })
  if (cancel1Err) {
    bugs.push({
      id: 'BUG-4.4-11',
      sev: 'P0',
      title: 'Cancelamento happy-path falhou',
      detail: cancel1Err.message,
      evidence: cancel1Err.message,
    })
    bad('cancel_1', cancel1Err.message)
  } else {
    ok('cancel_1', 'CANCELADA')
  }

  const est2 = await estoqueQty(produtoId, lojaId)
  if (est2 !== est0) {
    bugs.push({
      id: 'BUG-4.4-12',
      sev: 'P0',
      title: 'Estoque não retornou após cancel',
      detail: `esperado ${est0} veio ${est2}`,
    })
    bad('estoque_pos_cancel', `${est1}→${est2}`)
  } else {
    ok('estoque_pos_cancel', `${est1}→${est2} (ciclo completo)`)
  }

  const ePosCancel = await E(caixaId)
  if (Math.abs(ePosCancel - eAntes) > 0.02) {
    bugs.push({
      id: 'BUG-4.4-13',
      sev: 'P0',
      title: 'E(c) não voltou ao pré-venda após cancel (ADR α)',
      detail: `pré=${eAntes} pós=${ePosCancel}`,
    })
    bad('E_pos_cancel', `${eAntes}→${ePosCancel}`)
  } else {
    ok('E_pos_cancel', 'ciclo E=0')
  }

  const { data: vpAfter } = await admin
    .from('vendas_pagamentos')
    .select('id')
    .eq('venda_id', vendaId)
  if (!vpAfter?.length) {
    bugs.push({
      id: 'BUG-4.4-14',
      sev: 'P0',
      title: 'vendas_pagamentos apagado no cancel',
    })
    bad('vp_preservado', 'apagado')
  } else {
    ok('vp_preservado', `${vpAfter.length} linha(s)`)
  }

  const { data: aud } = await admin
    .from('vendas_canceladas_auditoria')
    .select('venda_id, operador_id, valor_estornado, motivo')
    .eq('venda_id', vendaId)
    .maybeSingle()
  if (!aud) {
    bugs.push({
      id: 'BUG-4.4-15',
      sev: 'P0',
      title: 'Sem vendas_canceladas_auditoria',
    })
    bad('auditoria_cancel', 'ausente')
  } else {
    ok('auditoria_cancel', `estorno=${aud.valor_estornado}`)
  }

  const { data: evCancel } = await admin
    .from('venda_eventos')
    .select('event_type, occurred_at, source')
    .eq('sale_id', vendaId)
    .eq('event_type', 'SALE_CANCELLED')
    .maybeSingle()
  if (!evCancel) {
    bugs.push({
      id: 'BUG-4.4-16',
      sev: 'P1',
      title: 'SALE_CANCELLED ausente em venda_eventos',
      detail: 'cancelar_venda chama registrar_venda_evento; evento não encontrado',
    })
    bad('auditoria_SALE_CANCELLED', 'ausente')
  } else {
    ok('auditoria_SALE_CANCELLED', `${evCancel.source} @ ${evCancel.occurred_at}`)
  }

  // Cancel duplicado
  const { error: cancel2Err } = await gerenteClient2.rpc('cancelar_venda_transacional', {
    p_venda_id: vendaId,
    p_motivo: `Missao4.4 cancel dup ${stamp}`,
    p_operador_id: gerenteId,
  })
  const msg2 = cancel2Err?.message || ''
  if (msg2.includes('CANCELAR_VENDA_JA_CANCELADA') || msg2.includes('JA_CANCELADA')) {
    ok('cancel_duplicado', msg2)
  } else if (!cancel2Err) {
    bugs.push({
      id: 'BUG-4.4-17',
      sev: 'P0',
      title: 'Cancelamento duplicado aceito',
    })
    bad('cancel_duplicado', 'aceitou')
  } else {
    bugs.push({
      id: 'BUG-4.4-17b',
      sev: 'P1',
      title: 'Cancel duplicado rejeitado com código inesperado',
      detail: msg2,
      evidence: msg2,
    })
    bad('cancel_duplicado', msg2)
  }

  const est3 = await estoqueQty(produtoId, lojaId)
  if (est3 !== est0) {
    bugs.push({
      id: 'BUG-4.4-18',
      sev: 'P0',
      title: 'Estoque alterado no cancel duplicado',
      detail: `${est0}→${est3}`,
    })
    bad('estoque_pos_cancel_dup', String(est3))
  } else {
    ok('estoque_pos_cancel_dup', `inalterado ${est3}`)
  }

  const { count: reposCount } = await admin
    .from('estoque_reposicoes_cancelamento')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
  ok('reposicao_unica', `count=${reposCount}`)
  if ((reposCount ?? 0) > 1) {
    bugs.push({
      id: 'BUG-4.4-19',
      sev: 'P1',
      title: 'Múltiplas reposições de estoque para o mesmo cancel',
      detail: String(reposCount),
    })
  }

  // -------------------------------------------------------------------------
  // Verdict
  // -------------------------------------------------------------------------
  const p0 = bugs.filter((b) => b.sev === 'P0')
  report.verdict = p0.length ? 'NO-GO' : 'GO'
  report.finishedAt = new Date().toISOString()
  report.bugs = bugs
  report.notes = notes
  report.checks = checks
  report.ids = { produtoId, caixaId, vendaId, lojaId }

  writeReport(report)
  console.log(`VERDICT ${report.verdict} 4.4`)
  if (bugs.length) console.log('BUGS', JSON.stringify(bugs, null, 2))
  if (notes.length) console.log('NOTES', notes)
  process.exit(report.verdict === 'GO' ? 0 : 2)
}

function writeReport(r) {
  const out = resolve('backend/artifacts', `missao4_4_ops_${stamp}.md`)
  const bugReal = (r.bugs || []).filter((b) => !String(b.id).endsWith('b'))
  const bugTest = (r.bugs || []).filter((b) => String(b.id).endsWith('b'))
  const fmt = (list) =>
    list.length
      ? list
          .map(
            (b) =>
              `### ${b.id} (${b.sev})\n\n**${b.title}**\n\n${b.detail || ''}\n\n\`\`\`\n${b.evidence || ''}\n\`\`\`\n`,
          )
          .join('\n')
      : '_Nenhum._'

  writeFileSync(
    out,
    [
      '# Missão 4.4 — Integridade Cross-Entity',
      '',
      `**Veredito:** ${r.verdict}`,
      `**Quando:** ${r.startedAt} → ${r.finishedAt}`,
      `**Contrato:** regras existentes (v4 + FK + cancel + ADR-CAIXA-002 E(c))`,
      '',
      '## Matriz',
      '',
      '| Check | Status | Detalhe |',
      '|---|---|---|',
      ...(r.checks || []).map(
        (c) => `| ${c.step} | ${c.ok ? 'OK' : 'FAIL'} | ${(c.detail || '').replace(/\|/g, '/').slice(0, 80)} |`,
      ),
      '',
      '## Bugs reais (≠ ajuste de teste)',
      '',
      fmt(bugReal),
      '',
      '## Ajustes / códigos inesperados (não necessariamente bug de produto)',
      '',
      fmt(bugTest),
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
