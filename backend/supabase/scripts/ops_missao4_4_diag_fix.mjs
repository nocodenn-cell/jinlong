/**
 * Pós-4.4 — validar fix BUG-4.4-DIAG-01 (verificar_consistencia_venda).
 *
 *   node --env-file=pdv-importados/.env.local backend/supabase/scripts/ops_missao4_4_diag_fix.mjs
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

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}
function ok(s, d) {
  console.log(`OK  ${s}${d ? ` — ${d}` : ''}`)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const authClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function clientWithToken(token) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const report = { startedAt: new Date().toISOString(), checks: [] }

function check(name, pass, detail) {
  report.checks.push({ name, pass, detail })
  if (pass) ok(name, detail)
  else {
    console.log(`BAD ${name} — ${detail}`)
    bugs.push({ id: name, detail })
  }
}

async function main() {
  // 1) NAO_ENCONTRADA
  const { data: miss, error: missErr } = await admin.rpc('verificar_consistencia_venda', {
    p_venda_id: randomUUID(),
  })
  check(
    'rpc_nao_encontrada',
    !missErr && Array.isArray(miss) && miss[0]?.status_venda === 'NAO_ENCONTRADA',
    missErr?.message || JSON.stringify(miss?.[0]),
  )

  // Setup venda CONCLUIDA
  const { data: gAuth, error: gErr } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  if (gErr) fail(gErr.message)
  const gerenteId = gAuth.user.id
  const { data: uG } = await admin.from('usuarios').select('loja_id').eq('id', gerenteId).single()
  const lojaId = uG.loja_id

  const { data: created, error: cErr } = await admin.rpc('criar_produto_com_estoque_inicial', {
    p_payload: {
      nome: `Missao4.4diag ${stamp}`,
      codigo_barras: `7895${String(Date.now()).slice(-9)}`,
      preco_varejo: VALOR,
      origem: 'china_manual',
      tem_nf: false,
      unidade_medida: 'UN',
      ativo: true,
      status_publicacao: 'PUBLICADO',
      estoque_inicial_quantidade: 3,
      estoque_inicial_minimo: 0,
    },
    p_ator_id: gerenteId,
    p_request_id: randomUUID(),
  })
  if (cErr) fail(cErr.message)
  const produtoId = created.produto_id

  const { data: opAuth, error: oErr } = await authClient.auth.signInWithPassword({
    email: operadorEmail,
    password,
  })
  if (oErr) fail(oErr.message)
  const operadorId = opAuth.user.id
  const op = clientWithToken(opAuth.session.access_token)

  let { data: caixa } = await op
    .from('caixas')
    .select('id')
    .eq('operador_id', operadorId)
    .eq('status', 'ABERTO')
    .limit(1)
    .maybeSingle()
  if (!caixa?.id) {
    const { data: aberto, error: aErr } = await op
      .from('caixas')
      .insert({
        operador_id: operadorId,
        loja_id: lojaId,
        valor_inicial: 0,
        status: 'ABERTO',
        data_abertura: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (aErr) fail(aErr.message)
    caixa = aberto
  }

  const vendaId = randomUUID()
  const { error: vErr } = await op.rpc('finalizar_venda_transacional_canonica_v4', {
    p_venda_id: vendaId,
    p_caixa_id: caixa.id,
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
    p_user_agent: 'ops-4-4-diag',
    p_device_id: 'ops',
    p_terminal_id: 'ops',
    p_cliente_id: null,
  })
  if (vErr) fail(vErr.message)
  ok('venda', vendaId)

  // 2) CONCLUIDA — deve executar sem erro de ambiguidade
  const { data: cons, error: consErr } = await admin.rpc('verificar_consistencia_venda', {
    p_venda_id: vendaId,
  })
  check('rpc_concluida_sem_erro', !consErr, consErr?.message || 'ok')
  const row = Array.isArray(cons) ? cons[0] : cons
  check(
    'rpc_concluida_shape',
    row &&
      row.status_venda === 'CONCLUIDA' &&
      typeof row.consistente === 'boolean' &&
      Array.isArray(row.anomalias) &&
      Number(row.pagamento_count) >= 1 &&
      Number(row.item_count) >= 1 &&
      Math.abs(Number(row.total_liquido) - VALOR) < 0.02,
    JSON.stringify(row),
  )
  check(
    'invariantes_pagamento',
    row &&
      !row.anomalias?.includes('sem_pagamento') &&
      !row.anomalias?.includes('pagamentos_divergentes') &&
      !row.anomalias?.includes('sem_itens'),
    JSON.stringify(row?.anomalias),
  )
  // evento ledger: reporta, mas não falha o fix se ausente (fora do escopo do bug)
  if (row?.anomalias?.includes('sem_evento_ledger')) {
    report.notes = ['sem_evento_ledger ainda reportado — invariante preservada, não é o bug DIAG-01']
  }

  // 3) CANCELADA — early return consistente=true
  const { data: g2 } = await authClient.auth.signInWithPassword({
    email: gerenteEmail,
    password,
  })
  const ger = clientWithToken(g2.session.access_token)
  const { error: cErr2 } = await ger.rpc('cancelar_venda_transacional', {
    p_venda_id: vendaId,
    p_motivo: `diag fix ${stamp}`,
    p_operador_id: gerenteId,
  })
  if (cErr2) fail(cErr2.message)

  const { data: consC, error: consCErr } = await admin.rpc('verificar_consistencia_venda', {
    p_venda_id: vendaId,
  })
  const rowC = Array.isArray(consC) ? consC[0] : consC
  check(
    'rpc_cancelada',
    !consCErr && rowC?.status_venda === 'CANCELADA' && rowC?.consistente === true,
    consCErr?.message || JSON.stringify(rowC),
  )

  report.verdict = bugs.length ? 'NO-GO' : 'GO'
  report.finishedAt = new Date().toISOString()
  report.bugs = bugs
  report.vendaId = vendaId

  const out = resolve('backend/artifacts', `missao4_4_diag_fix_${stamp}.md`)
  writeFileSync(
    out,
    [
      '# Pós-Missão 4.4 — Fix BUG-4.4-DIAG-01',
      '',
      `**Veredito:** ${report.verdict}`,
      `**Quando:** ${report.startedAt} → ${report.finishedAt}`,
      `**Migration:** \`20260718181600_fix_verificar_consistencia_venda_total_liquido.sql\``,
      `**RPC:** \`verificar_consistencia_venda\` apenas`,
      '',
      '## Causa raiz',
      '',
      'RETURNS TABLE expõe OUT params (`total_liquido`, `venda_id`) que colidem com colunas',
      'homônimas em SQL embutido do PL/pgSQL → `42702 ambiguous`.',
      '',
      '## Correção',
      '',
      '- Qualificar colunas com aliases (`v.`, `iv.`, `ve.`, `vp.`)',
      '- `#variable_conflict use_column`',
      '- Mesmos invariantes / mesma assinatura',
      '',
      '## Checks',
      '',
      '| Check | Status |',
      '|---|---|',
      ...report.checks.map((c) => `| ${c.name} | ${c.pass ? 'OK' : 'FAIL'} |`),
      '',
      '## Raw',
      '',
      '```json',
      JSON.stringify(report, null, 2),
      '```',
      '',
    ].join('\n'),
    'utf8',
  )
  console.log('REPORT', out)
  console.log(`VERDICT ${report.verdict}`)
  process.exit(report.verdict === 'GO' ? 0 : 2)
}

main().catch((e) => fail(e?.stack || String(e)))
