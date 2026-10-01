import type { SupabaseClient } from '@supabase/supabase-js'
import { LOJA_MATRIZ_ID } from './load-env.js'

export type LojaFinancialSnapshot = {
  ledgerFaturado: number
  ledgerQtd: number
  vendasFaturado: number
  vendasQtd: number
  kpiFaturado: number
  kpiQtd: number
  dashboardFaturado: number
  dashboardQtd: number
}

export type GateTestVerdict = {
  name: string
  pass: boolean
  details: string[]
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

function moneyEq(a: number, b: number): boolean {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) < 0.01
}

async function fetchVendasConcluidasLoja(
  admin: SupabaseClient,
  lojaId: string,
): Promise<{ id: string; total_liquido: number; caixa_id: string }[]> {
  const { data: caixas, error: cErr } = await admin
    .from('caixas')
    .select('id')
    .eq('loja_id', lojaId)
  if (cErr) throw new Error(`caixas: ${cErr.message}`)
  const caixaIds = (caixas ?? []).map((c) => c.id)
  if (caixaIds.length === 0) return []

  const { data: vendas, error: vErr } = await admin
    .from('vendas')
    .select('id, total_liquido, caixa_id, status')
    .eq('status', 'CONCLUIDA')
    .in('caixa_id', caixaIds)
  if (vErr) throw new Error(`vendas: ${vErr.message}`)
  return (vendas ?? []).map((v) => ({
    id: v.id,
    total_liquido: Number(v.total_liquido ?? 0),
    caixa_id: v.caixa_id,
  }))
}

/** Snapshot financeiro programático (substitui SQL A.3 / A.5 / A.6). */
export async function captureLojaSnapshot(
  admin: SupabaseClient,
  lojaId: string = LOJA_MATRIZ_ID,
): Promise<LojaFinancialSnapshot> {
  const { data: eventos, error: evErr } = await admin
    .from('venda_eventos')
    .select('sale_id, event_type, total')
    .eq('loja_id', lojaId)
    .eq('event_type', 'SALE_REGISTERED')
  if (evErr) throw new Error(`venda_eventos: ${evErr.message}`)

  const ledgerFaturado = roundMoney2(
    (eventos ?? []).reduce((s, e) => s + Number(e.total ?? 0), 0),
  )
  const ledgerQtd = (eventos ?? []).length

  const vendas = await fetchVendasConcluidasLoja(admin, lojaId)
  const vendasFaturado = roundMoney2(
    vendas.reduce((s, v) => s + v.total_liquido, 0),
  )
  const vendasQtd = vendas.length

  const { data: kpis, error: kpiErr } = await admin.rpc('kpis_venda_eventos_gerente', {
    p_loja_id: lojaId,
  })
  if (kpiErr) throw new Error(`kpis_venda_eventos_gerente: ${kpiErr.message}`)
  const kpiRow = (Array.isArray(kpis) ? kpis[0] : kpis) as {
    faturado?: number
    qtd_concluidas?: number
  }

  const { data: dash, error: dashErr } = await admin.rpc('dashboard_gerente_resumo', {
    p_loja_id: lojaId,
    p_tz: 'America/Sao_Paulo',
  })
  if (dashErr) throw new Error(`dashboard_gerente_resumo: ${dashErr.message}`)
  const dashJson = (typeof dash === 'object' && dash !== null ? dash : {}) as {
    faturamento_hoje?: number
    quantidade_vendas_hoje?: number
  }

  return {
    ledgerFaturado,
    ledgerQtd,
    vendasFaturado,
    vendasQtd,
    kpiFaturado: roundMoney2(Number(kpiRow?.faturado ?? 0)),
    kpiQtd: Number(kpiRow?.qtd_concluidas ?? 0),
    dashboardFaturado: roundMoney2(Number(dashJson.faturamento_hoje ?? 0)),
    dashboardQtd: Number(dashJson.quantidade_vendas_hoje ?? 0),
  }
}

export function snapshotDelta(
  before: LojaFinancialSnapshot,
  after: LojaFinancialSnapshot,
): LojaFinancialSnapshot {
  return {
    ledgerFaturado: roundMoney2(after.ledgerFaturado - before.ledgerFaturado),
    ledgerQtd: after.ledgerQtd - before.ledgerQtd,
    vendasFaturado: roundMoney2(after.vendasFaturado - before.vendasFaturado),
    vendasQtd: after.vendasQtd - before.vendasQtd,
    kpiFaturado: roundMoney2(after.kpiFaturado - before.kpiFaturado),
    kpiQtd: after.kpiQtd - before.kpiQtd,
    dashboardFaturado: roundMoney2(after.dashboardFaturado - before.dashboardFaturado),
    dashboardQtd: after.dashboardQtd - before.dashboardQtd,
  }
}

/** Teste 1 — cross-source: 1 SALE_REGISTERED por sale_id (substitui A.1/A.2). */
export async function validateCrossSourceDuplication(
  admin: SupabaseClient,
  saleId: string,
): Promise<GateTestVerdict> {
  const details: string[] = []

  const { count: vendaCount, error: vErr } = await admin
    .from('vendas')
    .select('id', { count: 'exact', head: true })
    .eq('id', saleId)
    .eq('status', 'CONCLUIDA')
  if (vErr) details.push(`vendas: ${vErr.message}`)

  const { data: events, error: eErr } = await admin
    .from('venda_eventos')
    .select('id, idempotency_key, source')
    .eq('sale_id', saleId)
    .eq('event_type', 'SALE_REGISTERED')
  if (eErr) details.push(`venda_eventos: ${eErr.message}`)

  const n = (events ?? []).length
  if ((vendaCount ?? 0) !== 1) {
    details.push(`vendas CONCLUIDA esperado 1, obtido ${vendaCount ?? 0}`)
  }
  if (n !== 1) {
    details.push(`SALE_REGISTERED esperado 1, obtido ${n}`)
    for (const ev of events ?? []) {
      details.push(`  event source=${ev.source} key=${ev.idempotency_key}`)
    }
  }

  const pass = (vendaCount ?? 0) === 1 && n === 1
  return { name: 'Duplicação', pass, details }
}

/** Teste 2 — split brain escopado aos sale_ids do simulador (determinístico, sem flakiness). */
export async function validateSplitBrainScoped(
  admin: SupabaseClient,
  lojaId: string,
  saleIds: string[],
  expectedFaturado: number,
  expectedQtd: number,
): Promise<GateTestVerdict> {
  const details: string[] = []
  let ledgerSum = 0
  let vendasSum = 0
  let gerenteListSum = 0

  const { data: listed, error: lErr } = await admin.rpc('listar_venda_eventos_gerente', {
    p_loja_id: lojaId,
    p_offset: 0,
    p_limit: 500,
  })
  if (lErr) details.push(`listar_venda_eventos_gerente: ${lErr.message}`)
  const listedRows = (listed ?? []) as { sale_id: string; total: number }[]

  for (const saleId of saleIds) {
    const { data: ev, error: eErr } = await admin
      .from('venda_eventos')
      .select('total, sale_id')
      .eq('sale_id', saleId)
      .eq('event_type', 'SALE_REGISTERED')
      .maybeSingle()
    if (eErr) details.push(`${saleId} ledger: ${eErr.message}`)
    else if (!ev) details.push(`${saleId} sem SALE_REGISTERED no ledger`)
    else ledgerSum += Number(ev.total ?? 0)

    const { data: v, error: vErr } = await admin
      .from('vendas')
      .select('total_liquido, status')
      .eq('id', saleId)
      .maybeSingle()
    if (vErr) details.push(`${saleId} vendas: ${vErr.message}`)
    else if (!v || v.status !== 'CONCLUIDA') details.push(`${saleId} não CONCLUIDA em vendas`)
    else vendasSum += Number(v.total_liquido ?? 0)

    const row = listedRows.find((r) => r.sale_id === saleId)
    if (!row) details.push(`${saleId} ausente em listar_venda_eventos_gerente`)
    else gerenteListSum += Number(row.total ?? 0)
  }

  ledgerSum = roundMoney2(ledgerSum)
  vendasSum = roundMoney2(vendasSum)
  gerenteListSum = roundMoney2(gerenteListSum)
  const expected = roundMoney2(expectedFaturado)

  if (saleIds.length !== expectedQtd) {
    details.push(`sale_ids length ${saleIds.length} != expectedQtd ${expectedQtd}`)
  }
  if (!moneyEq(ledgerSum, expected)) {
    details.push(`ledger scoped sum ${ledgerSum} != esperado ${expected}`)
  }
  if (!moneyEq(vendasSum, expected)) {
    details.push(`vendas scoped sum ${vendasSum} != esperado ${expected}`)
  }
  if (!moneyEq(gerenteListSum, expected)) {
    details.push(`gerente list scoped sum ${gerenteListSum} != esperado ${expected}`)
  }
  if (!moneyEq(ledgerSum, vendasSum)) {
    details.push(`ledger ${ledgerSum} != vendas ${vendasSum}`)
  }
  if (!moneyEq(ledgerSum, gerenteListSum)) {
    details.push(`ledger ${ledgerSum} != gerente list ${gerenteListSum}`)
  }

  const snapshot = await captureLojaSnapshot(admin, lojaId)
  if (!moneyEq(snapshot.ledgerFaturado, snapshot.vendasFaturado)) {
    details.push(
      `loja snapshot: ledger ${snapshot.ledgerFaturado} != vendas ${snapshot.vendasFaturado}`,
    )
  }
  if (!moneyEq(snapshot.vendasFaturado, snapshot.dashboardFaturado)) {
    details.push(
      `loja snapshot: vendas ${snapshot.vendasFaturado} != dashboard ${snapshot.dashboardFaturado}`,
    )
  }

  const pass = details.length === 0
  return { name: 'Split brain', pass, details }
}

/** Teste 3 — race: sem duplicata; venda em caixa FECHADO = FAIL (substitui A.4). */
export async function validateRaceCondition(
  admin: SupabaseClient,
  saleId: string,
): Promise<GateTestVerdict> {
  const details: string[] = []

  const { data: venda, error: vErr } = await admin
    .from('vendas')
    .select('id, status, caixa_id')
    .eq('id', saleId)
    .maybeSingle()
  if (vErr) details.push(`vendas: ${vErr.message}`)

  const { data: events, error: eErr } = await admin
    .from('venda_eventos')
    .select('id')
    .eq('sale_id', saleId)
    .eq('event_type', 'SALE_REGISTERED')
  if (eErr) details.push(`venda_eventos: ${eErr.message}`)

  const eventCount = (events ?? []).length
  const vendaCount = venda?.id ? 1 : 0

  if (vendaCount > 1) details.push('mais de uma venda para o mesmo sale_id')
  if (eventCount > 1) details.push(`SALE_REGISTERED duplicado: ${eventCount}`)

  if (venda?.id && venda.status === 'CONCLUIDA') {
    const { data: caixa, error: cErr } = await admin
      .from('caixas')
      .select('status')
      .eq('id', venda.caixa_id)
      .maybeSingle()
    if (cErr) details.push(`caixas: ${cErr.message}`)
    if (caixa?.status === 'FECHADO') {
      details.push(`venda CONCLUIDA em caixa FECHADO caixa_id=${venda.caixa_id}`)
    }
    if (vendaCount === 1 && eventCount !== 1) {
      details.push(`venda/ledger 1:1 violado: vendas=1 ledger=${eventCount}`)
    }
  }

  const pass = details.length === 0

  return { name: 'Race condition', pass, details }
}

/** Teste 4 — KPI drift tolerância zero (substitui A.5). */
export function validateKpiDrift(snapshot: LojaFinancialSnapshot): GateTestVerdict {
  const details: string[] = []
  // P-03/UX-010: o KPI lê `vendas` (exclui CANCELADA de faturado/concluídas); o ledger soma todo SALE_REGISTERED,
  // inclusive de vendas depois canceladas. A base de comparação do KPI é `vendas CONCLUIDA`.
  if (!moneyEq(snapshot.vendasFaturado, snapshot.kpiFaturado)) {
    details.push(
      `vendas CONCLUIDA faturado ${snapshot.vendasFaturado} != KPI ${snapshot.kpiFaturado}`,
    )
  }
  if (snapshot.vendasQtd !== snapshot.kpiQtd) {
    details.push(`vendas CONCLUIDA qtd ${snapshot.vendasQtd} != KPI qtd ${snapshot.kpiQtd}`)
  }
  const pass = details.length === 0
  return { name: 'KPI drift', pass, details }
}

/** Teste 5 — under-reporting: órfãos e 1:1 por sale_id (substitui A.6). */
export async function validateUnderReporting(
  admin: SupabaseClient,
  lojaId: string,
  saleIds: string[],
): Promise<GateTestVerdict> {
  const details: string[] = []

  for (const saleId of saleIds) {
    const { count: vCount, error: vErr } = await admin
      .from('vendas')
      .select('id', { count: 'exact', head: true })
      .eq('id', saleId)
      .eq('status', 'CONCLUIDA')
    if (vErr) details.push(`${saleId} vendas: ${vErr.message}`)

    const { data: evs, error: eErr } = await admin
      .from('venda_eventos')
      .select('id')
      .eq('sale_id', saleId)
      .eq('event_type', 'SALE_REGISTERED')
    if (eErr) details.push(`${saleId} ledger: ${eErr.message}`)

    const vc = vCount ?? 0
    const ec = (evs ?? []).length
    if (vc !== ec) {
      details.push(`sale_id ${saleId}: vendas=${vc} ledger SALE_REGISTERED=${ec}`)
    }
  }

  const vendas = await fetchVendasConcluidasLoja(admin, lojaId)
  const { data: eventos, error: evErr } = await admin
    .from('venda_eventos')
    .select('sale_id')
    .eq('loja_id', lojaId)
    .eq('event_type', 'SALE_REGISTERED')
  if (evErr) details.push(`venda_eventos loja: ${evErr.message}`)

  const ledgerSaleIds = new Set((eventos ?? []).map((e) => e.sale_id))
  const vendaIds = new Set(vendas.map((v) => v.id))

  for (const id of vendaIds) {
    if (!ledgerSaleIds.has(id)) {
      details.push(`venda CONCLUIDA sem ledger: ${id}`)
    }
  }
  for (const id of ledgerSaleIds) {
    if (!vendaIds.has(id)) {
      details.push(`ledger SALE_REGISTERED sem venda CONCLUIDA: ${id}`)
    }
  }

  const pass = details.length === 0
  return { name: 'Under-reporting', pass, details }
}

export async function validatePrerequisites(admin: SupabaseClient): Promise<void> {
  const { error: evErr } = await admin.from('venda_eventos').select('id').limit(1)
  if (evErr) {
    throw new Error(`Pré-requisito FAIL: venda_eventos — ${evErr.message} (migrations 228+?)`)
  }
  const { error: kpiErr } = await admin.rpc('kpis_venda_eventos_gerente', {
    p_loja_id: LOJA_MATRIZ_ID,
  })
  if (kpiErr) {
    throw new Error(`Pré-requisito FAIL: kpis_venda_eventos_gerente — ${kpiErr.message}`)
  }
}

export type HybridGateReport = {
  deterministicGo: boolean
  hybridGo: boolean
  modelDriftPass: boolean
  deterministicVerdicts: GateTestVerdict[]
  hybridVerdicts: GateTestVerdict[]
}

export function evaluateModelDrift(
  deterministic: GateTestVerdict[],
  hybrid: GateTestVerdict[],
): { pass: boolean; details: string[] } {
  const details: string[] = []
  const detMap = new Map(deterministic.map((v) => [v.name, v]))
  for (const h of hybrid) {
    const d = detMap.get(h.name)
    if (d?.pass && !h.pass) {
      details.push(`MODEL DRIFT: ${h.name} deterministic=PASS hybrid=FAIL`)
      if (h.details.length > 0) details.push(...h.details.map((x) => `  ${x}`))
    }
  }
  const detGo = deterministic.every((v) => v.pass)
  const hybGo = hybrid.every((v) => v.pass)
  if (detGo && !hybGo && details.length === 0) {
    details.push('MODEL DRIFT: deterministic GO mas hybrid NO-GO')
  }
  return { pass: details.length === 0, details }
}

export function printHybridProductionGate(report: HybridGateReport): void {
  const drift = evaluateModelDrift(report.deterministicVerdicts, report.hybridVerdicts)
  console.log('')
  console.log('[PDV HYBRID PRODUCTION GATE]')
  console.log('')
  console.log(`Deterministic: ${report.deterministicGo ? 'GO' : 'NO-GO'}`)
  console.log(`Hybrid: ${report.hybridGo ? 'GO' : 'NO-GO'}`)
  console.log(`Model Drift: ${drift.pass ? 'PASS' : 'FAIL'}`)
  if (!drift.pass) {
    for (const line of drift.details) console.log(`  ${line}`)
  }
  const finalGo = report.deterministicGo && report.hybridGo && drift.pass
  console.log('')
  console.log(`FINAL RESULT: ${finalGo ? 'GO' : 'NO-GO'}`)
  console.log('')
}

export function printSimulatedProductionGate(verdicts: GateTestVerdict[], go: boolean): void {
  const byName = new Map(verdicts.map((v) => [v.name, v]))
  const line = (key: string) => {
    const v = byName.get(key)
    const status = v?.pass ? 'PASS' : 'FAIL'
    console.log(`${key}: ${status}`)
    if (v && !v.pass && v.details.length > 0) {
      for (const d of v.details) console.log(`  - ${d}`)
    }
  }

  console.log('')
  console.log('[PDV SIMULATED PRODUCTION GATE]')
  console.log('')
  line('Duplicação')
  line('Split brain')
  line('Race condition')
  line('KPI drift')
  line('Under-reporting')
  console.log('')
  console.log(`FINAL RESULT: ${go ? 'GO' : 'NO-GO'}`)
  console.log('')
}
