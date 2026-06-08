export type NetworkSimulatorOptions = {
  /** Atraso artificial antes de cada tentativa (ms). */
  delayMs?: number
  /** Probabilidade de falha simulada por tentativa (0–1). Padrão 0.2. */
  failRate?: number
  /** Tentativas máximas (inclui a primeira). Padrão 3. */
  maxRetries?: number
  /** Erro lançado na falha simulada. */
  failError?: Error
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomFail(rate: number): boolean {
  return Math.random() < rate
}

/**
 * Executa `fn` com atraso opcional, falha aleatória e retry controlado.
 * Não altera produção — apenas envolve chamadas nos scripts de stress.
 */
export async function withNetworkSimulation<T>(
  fn: () => Promise<T>,
  options: NetworkSimulatorOptions = {},
): Promise<T> {
  const delayMs = options.delayMs ?? 0
  const failRate = options.failRate ?? 0.2
  const maxRetries = Math.max(1, options.maxRetries ?? 3)
  const failError = options.failError ?? new Error('NETWORK_SIMULATED_TIMEOUT')

  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (delayMs > 0) await sleep(delayMs)
    if (randomFail(failRate)) {
      lastError = failError
      continue
    }
    try {
      return await fn()
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** Retry simples sem falha aleatória (útil após timeout simulado). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 150,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1 && delayMs > 0) await sleep(delayMs)
    try {
      return await fn()
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
