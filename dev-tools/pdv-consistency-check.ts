/**
 * Valida COUNT/soma vendas vs venda_eventos, duplicatas, órfãos e caixa vs ledger.
 * Uso: npm run stress:pdv:check [-- caixa_id]
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOJA_MATRIZ_ID, loadPdvEnv, requireSupabaseEnv } from './load-env.js'

export type ConsistencyReport = {
  idempotencia: 'OK' | 'FAIL'
  duplicacao: number
  ledgerDrift: 'OK' | 'FAIL'
  orphans: number
  caixaVsLedger: 'MATCH' | 'MISMATCH'
  gerenteVsLedger: 'MATCH' | 'MISMATCH'
  details: string[]
  /** sale_id monitorado em cenários de idempotência */
  watchedSaleId?: string
}

export type ConsistencyScope = {
  lojaId?: string
  caixaId?: string | null
  operadorId?: string | null
  /** Após stress duplicate, validar este sale_id */
  watchedSaleId?: string
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

function moneyEq(a: number, b: number): boolean {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) < 0.01
}

export function printStressReport(report: ConsistencyReport): void {
  console.log('')
  console.log('[PDV STRESS REPORT]')
  console.log('')
  console.log(`Idempotência: ${report.idempotencia}`)
  console.log(`Duplicação: ${report.duplicacao === 0 ? '0' : report.duplicacao}`)
  console.log(`Ledger drift: ${report.ledgerDrift}`)
  console.log(`Orphans: ${report.orphans === 0 ? '0' : report.orphans}`)
  console.log(`Caixa vs Ledger: ${report.caixaVsLedger}`)
  if (report.details.length > 0) {
    console.log('')
    console.log('Detalhes:')
    for (const line of report.details) console.log(`  - ${line}`)
  }
  console.log('')
}

export async function runConsistencyCheck(
  admin: SupabaseClient,
  scope: ConsistencyScope = {},
): Promise<ConsistencyReport> {
  const lojaId = scope.lojaId ?? LOJA_MATRIZ_ID
  const details: string[] = []
  let duplicacao = 0
  let orphans = 0
  let ledgerDrift: 'OK' | 'FAIL' = 'OK'
  let caixaVsLedger: 'MATCH' | 'MISMATCH' = 'MATCH'
  let gerenteVsLedger: 'MATCH' | 'MISMATCH' = 'MATCH'
  let idempotencia: 'OK' | 'FAIL' = 'OK'

  // --- Órfãos: eventos com caixa inexistente ---
  const { data: eventos, error: evErr } = await admin
    .from('venda_eventos')
    .select('id, sale_id, caixa_id, event_type, total, idempotency_key')
    .eq('loja_id', lojaId)
  if (evErr) throw new Error(`venda_eventos: ${evErr.message}`)

  const { data: caixas, error: cxErr } = await admin.from('caixas').select('id, loja_id')
  if (cxErr) throw new Error(`caixas: ${cxErr.message}`)

  const caixaIds = new Set((caixas ?? []).map((c) => c.id))
  // `vendas` não tem loja_id: a loja vem do caixa.
  const caixaIdsDaLoja = (caixas ?? []).filter((c) => c.loja_id === lojaId).map((c) => c.id)
  const scopedEvents = (eventos ?? []).filter((e) => {
    if (scope.caixaId && e.caixa_id !== scope.caixaId) return false
    if (scope.operadorId) {
      // filtro indireto via caixa quando informado
    }
    return true
  })

  for (const ev of scopedEvents) {
    if (!caixaIds.has(ev.caixa_id)) {
      orphans++
      details.push(`Órfão event_id=${ev.id} caixa_id=${ev.caixa_id}`)
    }
  }

  // --- Duplicidade sale_id / idempotency_key ---
  const saleRegistered = scopedEvents.filter((e) => e.event_type === 'SALE_REGISTERED')
  const bySale = new Map<string, number>()
  const byIdem = new Map<string, number>()
  for (const ev of saleRegistered) {
    bySale.set(ev.sale_id, (bySale.get(ev.sale_id) ?? 0) + 1)
    byIdem.set(ev.idempotency_key, (byIdem.get(ev.idempotency_key) ?? 0) + 1)
  }
  for (const [saleId, count] of bySale) {
    if (count > 1) {
      duplicacao += count - 1
      details.push(`sale_id duplicado no ledger: ${saleId} (${count}x SALE_REGISTERED)`)
    }
  }
  for (const [key, count] of byIdem) {
    if (count > 1) {
      details.push(`idempotency_key duplicada: ${key} (${count}x)`)
    }
  }

  // --- COUNT vendas vs ledger ---
  let vendasQuery = admin
    .from('vendas')
    .select('id, total_liquido, caixa_id, status')
    .in('caixa_id', caixaIdsDaLoja)
    .eq('status', 'CONCLUIDA')
  if (scope.caixaId) vendasQuery = vendasQuery.eq('caixa_id', scope.caixaId)

  const { data: vendas, error: vErr } = await vendasQuery
  if (vErr) throw new Error(`vendas: ${vErr.message}`)

  const vendasCount = (vendas ?? []).length
  const ledgerSaleCount = saleRegistered.length
  const vendasSum = roundMoney2(
    (vendas ?? []).reduce((s, v) => s + Number(v.total_liquido ?? 0), 0),
  )
  const ledgerSum = roundMoney2(
    saleRegistered.reduce((s, e) => s + Number(e.total ?? 0), 0),
  )

  const saleIdsVendas = new Set((vendas ?? []).map((v) => v.id))
  const saleIdsLedger = new Set(saleRegistered.map((e) => e.sale_id))

  const missingInLedger = [...saleIdsVendas].filter((id) => !saleIdsLedger.has(id))
  const missingInVendas = [...saleIdsLedger].filter((id) => !saleIdsVendas.has(id))

  if (missingInLedger.length > 0 || missingInVendas.length > 0) {
    ledgerDrift = 'FAIL'
    if (missingInLedger.length > 0) {
      details.push(
        `${missingInLedger.length} venda(s) CONCLUIDA sem SALE_REGISTERED no ledger`,
      )
    }
    if (missingInVendas.length > 0) {
      details.push(
        `${missingInVendas.length} evento(s) SALE_REGISTERED sem venda CONCLUIDA`,
      )
    }
  }

  if (vendasCount !== ledgerSaleCount) {
    ledgerDrift = 'FAIL'
    details.push(
      `COUNT divergente: vendas=${vendasCount} ledger SALE_REGISTERED=${ledgerSaleCount}`,
    )
  }

  if (!moneyEq(vendasSum, ledgerSum)) {
    ledgerDrift = 'FAIL'
    details.push(`Soma divergente: vendas=${vendasSum} ledger=${ledgerSum}`)
  }

  // --- Caixa vs ledger (escopo caixa) ---
  if (scope.caixaId) {
    const { data: valorSistema, error: vsErr } = await admin.rpc(
      'calcular_valor_sistema_dinheiro_caixa',
      { p_caixa_id: scope.caixaId },
    )
    if (vsErr) {
      details.push(`calcular_valor_sistema_dinheiro_caixa: ${vsErr.message}`)
      caixaVsLedger = 'MISMATCH'
    } else {
      const sistema = roundMoney2(Number(valorSistema ?? 0))
      const caixaVendas = (vendas ?? []).filter((v) => v.caixa_id === scope.caixaId)
      const caixaVendasSum = roundMoney2(
        caixaVendas.reduce((s, v) => s + Number(v.total_liquido ?? 0), 0),
      )
      const caixaLedgerSum = roundMoney2(
        saleRegistered
          .filter((e) => e.caixa_id === scope.caixaId)
          .reduce((s, e) => s + Number(e.total ?? 0), 0),
      )
      if (!moneyEq(caixaVendasSum, caixaLedgerSum)) {
        caixaVsLedger = 'MISMATCH'
        details.push(
          `Caixa ${scope.caixaId}: vendas=${caixaVendasSum} ledger=${caixaLedgerSum}`,
        )
      }
      details.push(
        `valor_sistema_dinheiro caixa=${sistema} (inclui troco inicial + movimentos)`,
      )
    }
  }

  // --- Gerente KPIs vs vendas CONCLUIDA (P-03/UX-010: a RPC agrega VENDAS, não o ledger) ---
  const { data: kpis, error: kpiErr } = await admin.rpc('kpis_venda_eventos_gerente', {
    p_loja_id: lojaId,
  })
  if (kpiErr) {
    details.push(`kpis_venda_eventos_gerente: ${kpiErr.message}`)
    gerenteVsLedger = 'MISMATCH'
  } else {
    const row = (Array.isArray(kpis) ? kpis[0] : kpis) as {
      faturado?: number
      qtd_concluidas?: number
    }
    const kpiFaturado = roundMoney2(Number(row?.faturado ?? 0))
    const kpiQtd = Number(row?.qtd_concluidas ?? 0)
    // O KPI é da loja inteira; só é comparável com `vendas` quando não há escopo de caixa.
    if (!scope.caixaId && (!moneyEq(kpiFaturado, vendasSum) || kpiQtd !== vendasCount)) {
      gerenteVsLedger = 'MISMATCH'
      details.push(
        `Gerente KPIs: faturado=${kpiFaturado} qtd=${kpiQtd} vs vendas CONCLUIDA sum=${vendasSum} qtd=${vendasCount}`,
      )
    }
  }

  // --- Idempotência (sale_id observado) ---
  if (scope.watchedSaleId) {
    const { count: vendaRows, error: wvErr } = await admin
      .from('vendas')
      .select('id', { count: 'exact', head: true })
      .eq('id', scope.watchedSaleId)
    if (wvErr) throw new Error(wvErr.message)

    const ledgerForSale = saleRegistered.filter((e) => e.sale_id === scope.watchedSaleId)
    if ((vendaRows ?? 0) !== 1 || ledgerForSale.length !== 1) {
      idempotencia = 'FAIL'
      details.push(
        `watched sale_id=${scope.watchedSaleId}: vendas=${vendaRows ?? 0} ledger=${ledgerForSale.length}`,
      )
    }
  }

  if (duplicacao > 0) idempotencia = 'FAIL'

  return {
    idempotencia,
    duplicacao,
    ledgerDrift,
    orphans,
    caixaVsLedger,
    gerenteVsLedger,
    details,
    watchedSaleId: scope.watchedSaleId,
  }
}

async function main(): Promise<void> {
  loadPdvEnv()
  const env = requireSupabaseEnv()
  const admin = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const caixaId = process.argv[2]?.trim() || null
  const report = await runConsistencyCheck(admin, {
    lojaId: LOJA_MATRIZ_ID,
    caixaId: caixaId || undefined,
  })
  printStressReport(report)

  const failed =
    report.idempotencia === 'FAIL' ||
    report.duplicacao > 0 ||
    report.ledgerDrift === 'FAIL' ||
    report.orphans > 0 ||
    report.caixaVsLedger === 'MISMATCH'

  process.exit(failed ? 1 : 0)
}

const isMain = process.argv[1]?.includes('pdv-consistency-check')
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
