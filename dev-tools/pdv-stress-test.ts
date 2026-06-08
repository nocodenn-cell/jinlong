/**
 * Stress test operacional PDV (caos controlado).
 *
 * Uso:
 *   npm run stress:pdv              # todos os cenários
 *   npm run stress:pdv -- duplicate # N POSTs mesmo sale_id (STRESS_DUPLICATE_N=20)
 *   npm run stress:pdv -- rapid | retry | concurrent
 *   npm run stress:pdv:check
 *
 * Pré-requisitos: migrations 228–231, seed:dev-users + seed:demo-fluxo, .env.local em pdv-importados.
 */
import { randomUUID } from 'node:crypto'
import { LOJA_MATRIZ_ID } from './load-env.js'
import { withNetworkSimulation, withRetry } from './network-simulator.js'
import {
  printStressReport,
  runConsistencyCheck,
  type ConsistencyReport,
} from './pdv-consistency-check.js'
import { PdvStressClient } from './pdv-stress-client.js'

export type StressScenarioResult = {
  scenario: string
  report: ConsistencyReport
  meta: Record<string, unknown>
}

async function finalizeReport(
  client: PdvStressClient,
  watchedSaleId: string | undefined,
  scenario: string,
  meta: Record<string, unknown> = {},
): Promise<StressScenarioResult> {
  const report = await runConsistencyCheck(client.admin, {
    lojaId: LOJA_MATRIZ_ID,
    caixaId: client.caixaId ?? undefined,
    operadorId: client.operadorId ?? undefined,
    watchedSaleId,
  })
  console.log(`\n=== Cenário: ${scenario} ===`)
  if (Object.keys(meta).length > 0) {
    console.log('Meta:', JSON.stringify(meta, null, 2))
  }
  printStressReport(report)
  return { scenario, report, meta }
}

/**
 * Dispara N POSTs paralelos com o mesmo payload (mesmo sale_id).
 */
export async function stressDuplicateSale(n = 10): Promise<StressScenarioResult> {
  const client = new PdvStressClient()
  await client.init()
  const saleId = randomUUID()

  const results = await Promise.allSettled(
    Array.from({ length: n }, () => client.postSale(saleId)),
  )

  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
  const fail = results.length - ok

  return finalizeReport(client, saleId, 'stressDuplicateSale', {
    parallelPosts: n,
    successes: ok,
    failures: fail,
    saleId,
  })
}

/**
 * Simula 5 cliques rápidos em "finalizar venda" (sale_ids distintos).
 */
export async function stressRapidClicks(): Promise<StressScenarioResult> {
  const client = new PdvStressClient()
  await client.init()

  const saleIds: string[] = []
  for (let i = 0; i < 5; i++) {
    const id = randomUUID()
    saleIds.push(id)
    const r = await client.postSale(id)
    if (!r.ok) {
      console.warn(`[rapid ${i + 1}/5] falhou:`, r.error)
    }
  }

  return finalizeReport(client, undefined, 'stressRapidClicks', {
    saleIds,
    count: 5,
  })
}

/**
 * Simula timeout de rede + retry da mesma venda (idempotência).
 */
export async function stressNetworkRetry(): Promise<StressScenarioResult> {
  const client = new PdvStressClient()
  await client.init()
  const saleId = randomUUID()

  const postOrThrow = async () => {
    const r = await client.postSale(saleId)
    if (!r.ok) throw new Error(r.error)
    return r
  }

  let attempts = 0
  try {
    await withNetworkSimulation(
      async () => {
        attempts++
        return postOrThrow()
      },
      { delayMs: 80, failRate: 0.25, maxRetries: 4 },
    )
  } catch {
    await withRetry(postOrThrow, 3, 200)
  }

  const second = await client.postSale(saleId)

  return finalizeReport(client, saleId, 'stressNetworkRetry', {
    saleId,
    simulatedAttempts: attempts,
    secondPostOk: second.ok,
  })
}

/**
 * Fecha caixa enquanto uma venda está em processamento (concorrência).
 */
export async function stressConcurrentCloseAndSale(): Promise<StressScenarioResult> {
  const client = new PdvStressClient()
  await client.init()
  const saleId = randomUUID()
  const caixaBefore = client.caixaId

  const salePromise = client.postSale(saleId)
  const closePromise = client.closeCaixa()

  const [saleSettled, closeSettled] = await Promise.allSettled([salePromise, closePromise])

  const saleOk =
    saleSettled.status === 'fulfilled' && saleSettled.value.ok
      ? saleSettled.value
      : null
  const closeOk =
    closeSettled.status === 'fulfilled' && closeSettled.value.ok
      ? closeSettled.value
      : null

  await client.reopenCaixaIfNeeded()

  return finalizeReport(client, saleId, 'stressConcurrentCloseAndSale', {
    saleId,
    caixaBefore,
    saleOk: Boolean(saleOk),
    closeOk: Boolean(closeOk),
    closeAlreadyClosed: closeOk?.alreadyClosed ?? false,
    saleError:
      saleSettled.status === 'rejected'
        ? String(saleSettled.reason)
        : saleSettled.status === 'fulfilled' && !saleSettled.value.ok
          ? saleSettled.value.error
          : null,
    closeError:
      closeSettled.status === 'rejected'
        ? String(closeSettled.reason)
        : closeSettled.status === 'fulfilled' && !closeSettled.value.ok
          ? closeSettled.value.error
          : null,
  })
}

const SCENARIOS: Record<string, () => Promise<StressScenarioResult>> = {
  duplicate: () => stressDuplicateSale(Number(process.env.STRESS_DUPLICATE_N ?? 10)),
  rapid: stressRapidClicks,
  retry: stressNetworkRetry,
  concurrent: stressConcurrentCloseAndSale,
}

async function runAll(): Promise<number> {
  const order: (keyof typeof SCENARIOS)[] = ['duplicate', 'rapid', 'retry', 'concurrent']
  let exitCode = 0
  for (const key of order) {
    const result = await SCENARIOS[key]()
    const r = result.report
    if (
      r.idempotencia === 'FAIL' ||
      r.duplicacao > 0 ||
      r.ledgerDrift === 'FAIL' ||
      r.orphans > 0
    ) {
      exitCode = 1
    }
  }
  return exitCode
}

async function main(): Promise<void> {
  const arg = (process.argv[2] ?? 'all').toLowerCase()

  if (arg === 'all') {
    const code = await runAll()
    process.exit(code)
  }

  const fn = SCENARIOS[arg]
  if (!fn) {
    console.error(
      `Cenário desconhecido: ${arg}. Use: duplicate | rapid | retry | concurrent | all`,
    )
    process.exit(1)
  }

  const result = await fn()
  const r = result.report
  const failed =
    r.idempotencia === 'FAIL' ||
    r.duplicacao > 0 ||
    r.ledgerDrift === 'FAIL' ||
    r.orphans > 0 ||
    r.caixaVsLedger === 'MISMATCH'

  process.exit(failed ? 1 : 0)
}

const isMain = process.argv[1]?.includes('pdv-stress-test')
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
