import { createDeterministicRng, parseGateSeed } from './gate-deterministic-rng.js'

export const CHAOS_MAX_RETRIES = 4

export type ChaosLayerStats = {
  latencyInjections: number
  forcedTimeouts: number
  earlyTimeouts: number
  retries: number
  partialFailureChecks: number
  partialFailuresDetected: number
}

export type ChaosExecuteOptions = {
  /** Verificação pós-RPC: venda sem ledger após OK (partial failure). */
  verifyLedger?: () => Promise<boolean>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseChaosSeed(): number {
  const raw = process.env.GATE_CHAOS_SEED?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n)) return n
  }
  return parseGateSeed() + 9_001
}

/**
 * Camada de caos real sobre RPCs — latência, timeout, retry e concorrência.
 * RNG seedado por GATE_CHAOS_SEED para caos reproduzível entre runs do hybrid.
 */
export class GateChaosLayer {
  readonly stats: ChaosLayerStats = {
    latencyInjections: 0,
    forcedTimeouts: 0,
    earlyTimeouts: 0,
    retries: 0,
    partialFailureChecks: 0,
    partialFailuresDetected: 0,
  }

  private readonly rng = createDeterministicRng(parseChaosSeed())
  private readonly timeoutRate: number
  private readonly earlyTimeoutRate: number
  private readonly partialCheckRate: number

  constructor() {
    const timeoutPct = Number(process.env.GATE_CHAOS_TIMEOUT_PCT ?? '7.5')
    this.timeoutRate = Math.min(0.1, Math.max(0.05, timeoutPct / 100))
    this.earlyTimeoutRate = Number(process.env.GATE_CHAOS_EARLY_TIMEOUT_PCT ?? '1.5') / 100
    this.partialCheckRate = Number(process.env.GATE_CHAOS_PARTIAL_CHECK_PCT ?? '2') / 100
    console.log(
      `[gate-chaos] CHAOS_INJECTION=true seed=${parseChaosSeed()} timeout_rate=${this.timeoutRate} max_retries=${CHAOS_MAX_RETRIES}`,
    )
  }

  private sampleLatencyMs(): number {
    const roll = this.rng.next()
    if (roll > 0.99) return this.rng.nextInt(1500, 2000)
    if (roll > 0.95) return this.rng.nextInt(800, 1500)
    return this.rng.nextInt(50, 400)
  }

  private async injectLatency(op: string): Promise<void> {
    const ms = this.sampleLatencyMs()
    this.stats.latencyInjections++
    console.log(`[gate-chaos] CHAOS_INJECTION=true latency op=${op} ms=${ms}`)
    await sleep(ms)
  }

  /** Executa RPC com caos + retry real (replay de request). */
  async execute<T>(op: string, fn: () => Promise<T>, options?: ChaosExecuteOptions): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= CHAOS_MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        this.stats.retries++
        console.log(`[gate-chaos] CHAOS_INJECTION=true retry op=${op} attempt=${attempt}`)
      }

      await this.injectLatency(op)

      if (this.rng.next() < this.earlyTimeoutRate) {
        this.stats.earlyTimeouts++
        console.log(`[gate-chaos] CHAOS_INJECTION=true early_timeout op=${op} attempt=${attempt}`)
        void fn().catch(() => {})
        lastError = new Error('CHAOS_EARLY_TIMEOUT')
        continue
      }

      if (this.rng.next() < this.timeoutRate) {
        this.stats.forcedTimeouts++
        console.log(`[gate-chaos] CHAOS_INJECTION=true forced_timeout op=${op} attempt=${attempt}`)
        lastError = new Error('CHAOS_FORCED_TIMEOUT')
        continue
      }

      try {
        const result = await fn()

        if (options?.verifyLedger && this.rng.next() < this.partialCheckRate) {
          this.stats.partialFailureChecks++
          const ok = await options.verifyLedger()
          if (!ok) {
            this.stats.partialFailuresDetected++
            console.log(`[gate-chaos] CHAOS_INJECTION=true partial_failure_detected op=${op}`)
            lastError = new Error('CHAOS_PARTIAL_FAILURE_LEDGER_DRIFT')
            continue
          }
        }

        return result
      } catch (e) {
        lastError = e
        console.log(
          `[gate-chaos] CHAOS_INJECTION=true rpc_error op=${op} attempt=${attempt} msg=${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  /** Concorrência real — N chamadas paralelas sem ordenação. */
  async executeParallel<T>(op: string, fns: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
    console.log(`[gate-chaos] CHAOS_INJECTION=true parallel op=${op} count=${fns.length}`)
    return Promise.allSettled(fns.map((fn, i) => this.execute(`${op}[${i}]`, fn)))
  }
}
