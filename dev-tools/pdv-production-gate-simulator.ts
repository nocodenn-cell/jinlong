/**
 * PDV Production Gate — deterministic + hybrid (caos real em staging).
 *
 * Uso:
 *   npm run gate:pdv                          # deterministic (padrão)
 *   npm run gate:pdv -- --mode=hybrid         # só hybrid + caos
 *   npm run gate:pdv -- --mode=full           # deterministic + hybrid + model drift
 *   GATE_SEED=12345 GATE_CHAOS_SEED=999 npm run gate:pdv -- --mode=full
 *   GATE_ENV=staging npm run gate:pdv -- --mode=hybrid
 */
import { deterministicUuid, parseGateSeed } from './gate-deterministic-rng.js'
import { GateChaosLayer } from './gate-chaos-layer.js'
import { assertHybridStagingOnly } from './gate-staging-guard.js'
import { runGateTestSuite, type SimulationContext } from './gate-test-suite.js'
import type { GateTestVerdict } from './gate-validation-engine.js'
import {
  evaluateModelDrift,
  printHybridProductionGate,
  printSimulatedProductionGate,
  validatePrerequisites,
  type HybridGateReport,
} from './gate-validation-engine.js'
import { PdvGateClient, withDeterministicRetry } from './pdv-gate-client.js'
import { LOJA_MATRIZ_ID, requireSupabaseEnv } from './load-env.js'

export type GateMode = 'deterministic' | 'hybrid' | 'full'

export function parseGateMode(): GateMode {
  const argv = process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1]
  const env = process.env.GATE_MODE?.trim().toLowerCase()
  const raw = argv ?? env ?? 'deterministic'
  if (raw === 'hybrid' || raw === 'hybrid_mode') return 'hybrid'
  if (raw === 'full' || raw === 'both') return 'full'
  return 'deterministic'
}

async function runDeterministicPass(seed: number) {
  console.log('[pdv-gate] deterministic_mode SEED=' + seed)
  const client = new PdvGateClient()
  await client.initGate()
  await validatePrerequisites(client.admin)

  const ctx: SimulationContext = {
    seed,
    saleIds: [],
    precoUnitario: client.precoUnitario,
    idPrefix: 'det',
  }

  return runGateTestSuite(client, ctx, {
    saleIdFor: (k) => deterministicUuid(seed, `det-${k}`),
    itemIdFor: (k) => deterministicUuid(seed, `det-${k}-item`),
    withRetry: async (_label, fn) => withDeterministicRetry(fn),
    parallelSplitBrainSales: false,
    chaosParallelBurst: false,
  })
}

async function runHybridPass(seed: number) {
  assertHybridStagingOnly()
  const env = requireSupabaseEnv()
  console.log('[pdv-gate] hybrid_mode CHAOS_INJECTION=true url=' + env.url)
  console.log('[pdv-gate] LOJA=' + LOJA_MATRIZ_ID)

  const chaos = new GateChaosLayer()
  const client = new PdvGateClient(undefined, chaos)
  await client.initGate()
  await validatePrerequisites(client.admin)

  const ctx: SimulationContext = {
    seed,
    saleIds: [],
    precoUnitario: client.precoUnitario,
    idPrefix: 'hyb',
  }

  const result = await runGateTestSuite(client, ctx, {
    saleIdFor: (k) => deterministicUuid(seed, `hyb-${k}`),
    itemIdFor: (k) => deterministicUuid(seed, `hyb-${k}-item`),
    withRetry: async (label, fn) => chaos.execute(`retry:${label}`, fn),
    parallelSplitBrainSales: true,
    chaosParallelBurst: true,
  })

  console.log('[pdv-gate] chaos_stats', JSON.stringify(chaos.stats))
  return result
}

export async function simulateProductionGate(mode: GateMode = parseGateMode()): Promise<{
  mode: GateMode
  go: boolean
  deterministicVerdicts?: GateTestVerdict[]
  hybridVerdicts?: GateTestVerdict[]
  hybridReport?: HybridGateReport
}> {
  const seed = parseGateSeed()

  if (mode === 'deterministic') {
    const det = await runDeterministicPass(seed)
    return { mode, go: det.go, deterministicVerdicts: det.verdicts }
  }

  if (mode === 'hybrid') {
    const hyb = await runHybridPass(seed)
    return { mode, go: hyb.go, hybridVerdicts: hyb.verdicts }
  }

  const det = await runDeterministicPass(seed)
  const hyb = await runHybridPass(seed)
  const drift = evaluateModelDrift(det.verdicts, hyb.verdicts)
  const hybridReport: HybridGateReport = {
    deterministicGo: det.go,
    hybridGo: hyb.go,
    modelDriftPass: drift.pass,
    deterministicVerdicts: det.verdicts,
    hybridVerdicts: hyb.verdicts,
  }
  const go = det.go && hyb.go && drift.pass
  return {
    mode,
    go,
    deterministicVerdicts: det.verdicts,
    hybridVerdicts: hyb.verdicts,
    hybridReport,
  }
}

async function main(): Promise<void> {
  const mode = parseGateMode()
  console.log(`[pdv-gate-simulator] mode=${mode}`)

  const result = await simulateProductionGate(mode)

  if (mode === 'deterministic' && result.deterministicVerdicts) {
    printSimulatedProductionGate(result.deterministicVerdicts, result.go)
  } else if (mode === 'hybrid' && result.hybridVerdicts) {
    printSimulatedProductionGate(result.hybridVerdicts, result.go)
    console.log('[PDV HYBRID PRODUCTION GATE]')
    console.log('')
    console.log('Deterministic: SKIPPED')
    console.log(`Hybrid: ${result.go ? 'GO' : 'NO-GO'}`)
    console.log('Model Drift: SKIPPED')
    console.log('')
    console.log(`FINAL RESULT: ${result.go ? 'GO' : 'NO-GO'}`)
    console.log('')
  } else if (result.hybridReport) {
    printHybridProductionGate(result.hybridReport)
  }

  process.exit(result.go ? 0 : 1)
}

const isMain = process.argv[1]?.includes('pdv-production-gate-simulator')
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
