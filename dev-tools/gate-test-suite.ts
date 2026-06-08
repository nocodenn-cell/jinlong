import { LOJA_MATRIZ_ID } from './load-env.js'
import type { GateTestVerdict } from './gate-validation-engine.js'
import {
  validateCrossSourceDuplication,
  validateKpiDrift,
  validateRaceCondition,
  validateSplitBrainScoped,
  validateUnderReporting,
  captureLojaSnapshot,
} from './gate-validation-engine.js'
import type { PdvGateClient } from './pdv-gate-client.js'
import type { SalePostResult } from './pdv-stress-client.js'

export type SimulationContext = {
  seed: number
  saleIds: string[]
  precoUnitario: number
  idPrefix: string
}

export type GateTestSuiteOptions = {
  /** Gera sale_id / item_id determinísticos por chave de teste. */
  saleIdFor: (testKey: string) => string
  itemIdFor: (testKey: string) => string
  /** Retry policy (determinístico ou caos). */
  withRetry: <T>(label: string, fn: () => Promise<T>) => Promise<T>
  /** Vendas do teste 2 em paralelo (hybrid). */
  parallelSplitBrainSales?: boolean
  /** Burst concorrente extra no hybrid (teste 2). */
  chaosParallelBurst?: boolean
}

export type GateRunResult = {
  go: boolean
  verdicts: GateTestVerdict[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

async function ensureCaixaAberto(client: PdvGateClient): Promise<void> {
  await client.reopenCaixaIfNeeded()
}

export async function runGateTestSuite(
  client: PdvGateClient,
  ctx: SimulationContext,
  opts: GateTestSuiteOptions,
): Promise<GateRunResult> {
  const verdicts: GateTestVerdict[] = []

  verdicts.push(await runTest1Duplication(client, ctx, opts))
  verdicts.push(await runTest2SplitBrain(client, ctx, opts))
  verdicts.push(await runTest3Race(client, ctx, opts))
  verdicts.push(await runTest4KpiDrift(client))
  verdicts.push(await runTest5UnderReporting(client, ctx, opts))

  return { go: verdicts.every((v) => v.pass), verdicts }
}

async function runTest1Duplication(
  client: PdvGateClient,
  ctx: SimulationContext,
  opts: GateTestSuiteOptions,
): Promise<GateTestVerdict> {
  const saleId = opts.saleIdFor('t1-cross-source')
  const itemId = opts.itemIdFor('t1-item')
  ctx.saleIds.push(saleId)

  await ensureCaixaAberto(client)

  const web = await opts.withRetry('t1-web', () => client.postSaleWeb(saleId, itemId))
  if (!web.ok) {
    return { name: 'Duplicação', pass: false, details: [`web_caixa falhou: ${web.error}`] }
  }

  const replay = await opts.withRetry('t1-replay', () => client.replaySyncOutboxEnsure(saleId))
  if (!replay.ok) {
    return { name: 'Duplicação', pass: false, details: [`replay sync_outbox falhou: ${replay.error}`] }
  }

  return validateCrossSourceDuplication(client.admin, saleId)
}

async function runTest2SplitBrain(
  client: PdvGateClient,
  ctx: SimulationContext,
  opts: GateTestSuiteOptions,
): Promise<GateTestVerdict> {
  const labels = ['t2-sale-a', 't2-sale-b', 't2-sale-c'] as const
  const saleCount = labels.length
  const expectedFaturado = round2(ctx.precoUnitario * saleCount)

  await ensureCaixaAberto(client)

  const ids: string[] = []
  const postOne = async (label: (typeof labels)[number]) => {
    const saleId = opts.saleIdFor(label)
    const itemId = opts.itemIdFor(`${label}-item`)
    ids.push(saleId)
    ctx.saleIds.push(saleId)
    return client.postSaleWeb(saleId, itemId)
  }

  if (opts.parallelSplitBrainSales && client.chaos) {
    const settled = await client.chaos.executeParallel(
      't2-parallel-sales',
      labels.map((label) => () => opts.withRetry(`t2-${label}`, () => postOne(label))),
    )
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]
      if (s.status === 'rejected' || (s.status === 'fulfilled' && !s.value.ok)) {
        const err =
          s.status === 'rejected'
            ? String(s.reason)
            : (s.value as SalePostResult).error
        return { name: 'Split brain', pass: false, details: [`venda ${labels[i]} falhou: ${err}`] }
      }
    }
  } else {
    for (const label of labels) {
      const res = await opts.withRetry(`t2-${label}`, () => postOne(label))
      if (!res.ok) {
        return { name: 'Split brain', pass: false, details: [`venda ${label} falhou: ${res.error}`] }
      }
    }
  }

  if (opts.chaosParallelBurst && client.chaos) {
    const burstId = opts.saleIdFor('t2-chaos-burst')
    const burstItem = opts.itemIdFor('t2-chaos-burst-item')
    ctx.saleIds.push(burstId)
    await client.chaos.executeParallel('t2-burst', [
      () => client.postSaleWeb(burstId, burstItem),
      () => client.replaySyncOutboxEnsure(burstId),
      async () => {
        await client.admin.from('venda_eventos').select('id').eq('sale_id', burstId).limit(1)
        return { ok: true }
      },
    ])
  }

  return validateSplitBrainScoped(
    client.admin,
    LOJA_MATRIZ_ID,
    ids,
    expectedFaturado,
    saleCount,
  )
}

async function runTest3Race(
  client: PdvGateClient,
  ctx: SimulationContext,
  opts: GateTestSuiteOptions,
): Promise<GateTestVerdict> {
  const saleId = opts.saleIdFor('t3-race')
  const itemId = opts.itemIdFor('t3-item')
  ctx.saleIds.push(saleId)

  await ensureCaixaAberto(client)

  const [saleSettled, closeSettled] = await Promise.allSettled([
    opts.withRetry('t3-sale', () => client.postSaleWeb(saleId, itemId)),
    opts.withRetry('t3-close', () => client.closeCaixa()),
  ])

  if (closeSettled.status === 'rejected') {
    return {
      name: 'Race condition',
      pass: false,
      details: [`fechar_caixa exceção: ${String(closeSettled.reason)}`],
    }
  }

  await client.reopenCaixaIfNeeded()
  const verdict = await validateRaceCondition(client.admin, saleId)
  return { ...verdict, name: 'Race condition' }
}

async function runTest4KpiDrift(client: PdvGateClient): Promise<GateTestVerdict> {
  const snapshot = await captureLojaSnapshot(client.admin, LOJA_MATRIZ_ID)
  const verdict = validateKpiDrift(snapshot)
  return { ...verdict, name: 'KPI drift' }
}

async function runTest5UnderReporting(
  client: PdvGateClient,
  ctx: SimulationContext,
  opts: GateTestSuiteOptions,
): Promise<GateTestVerdict> {
  const details: string[] = []
  const localSaleIds: string[] = []

  await ensureCaixaAberto(client)

  const retrySaleId = opts.saleIdFor('t5-retry')
  const retryItemId = opts.itemIdFor('t5-retry-item')
  localSaleIds.push(retrySaleId)
  ctx.saleIds.push(retrySaleId)

  try {
    await opts.withRetry('t5-retry-first', async () => {
      const r = await client.postSaleWeb(retrySaleId, retryItemId)
      if (!r.ok) throw new Error(r.error ?? 'retry falhou')
      return r
    })
  } catch (e) {
    details.push(`retry falhou: ${e instanceof Error ? e.message : String(e)}`)
  }

  const second = await opts.withRetry('t5-retry-second', () =>
    client.postSaleWeb(retrySaleId, retryItemId),
  )
  if (!second.ok) details.push(`segundo post retry falhou: ${second.error}`)

  const syncSaleId = opts.saleIdFor('t5-sync')
  const syncItemId = opts.itemIdFor('t5-sync-item')
  localSaleIds.push(syncSaleId)
  ctx.saleIds.push(syncSaleId)
  const sync = await opts.withRetry('t5-sync', () => client.postSaleSyncOutbox(syncSaleId, syncItemId))
  if (!sync.ok) details.push(`sync_outbox falhou: ${sync.error}`)

  const cancelTarget = opts.saleIdFor('t5-cancel')
  const cancelItemId = opts.itemIdFor('t5-cancel-item')
  localSaleIds.push(cancelTarget)
  ctx.saleIds.push(cancelTarget)

  const cancelSale = await opts.withRetry('t5-cancel-sale', () =>
    client.postSaleWeb(cancelTarget, cancelItemId),
  )
  if (!cancelSale.ok) {
    details.push(`venda para cancel falhou: ${cancelSale.error}`)
  } else {
    const cancel = await opts.withRetry('t5-cancel-rpc', () => client.cancelSale(cancelTarget))
    if (!cancel.ok) details.push(`cancel falhou: ${cancel.error}`)
    else {
      const { count, error } = await client.admin
        .from('venda_eventos')
        .select('id', { count: 'exact', head: true })
        .eq('sale_id', cancelTarget)
        .eq('event_type', 'SALE_CANCELLED')
      if (error) details.push(`SALE_CANCELLED lookup: ${error.message}`)
      else if ((count ?? 0) !== 1) details.push(`SALE_CANCELLED esperado 1, obtido ${count ?? 0}`)
    }
  }

  const verdict = await validateUnderReporting(client.admin, LOJA_MATRIZ_ID, localSaleIds)
  return {
    name: 'Under-reporting',
    pass: verdict.pass && details.length === 0,
    details: [...details, ...verdict.details],
  }
}
