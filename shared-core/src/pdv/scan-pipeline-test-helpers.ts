/**
 * Helpers de teste — espera **semântica** (invariantes / estado observável / condição operacional), não “dormir um pouco”.
 *
 * - `waitUntil`: repete um **predicado booleano** até passar (ex.: profundidade da fila, comprimento de um array de teste).
 * - `waitForCurrentScanState`: marco explícito do controller (`getCurrentScan()?.state`).
 *
 * Não usar estes helpers como substituto de `sleep` sem predicado — o `description` existe para falhar com mensagem clara em CI.
 *
 * Ver docs/SCAN_PIPELINE_STATE_MACHINE.md.
 */
import type { ScanPipelineController, ScanState } from './scan-pipeline'

export type WaitUntilOptions = {
  timeoutMs?: number
  /** Mensagem se expirar (útil em falhas de CI). */
  description?: string
}

/**
 * Repete `predicate` até ser true ou `timeoutMs`.
 * Usa `setImmediate` (ambiente `node` do Vitest) em vez de “N voltas de Promise.resolve”.
 */
export async function waitUntil(predicate: () => boolean, options?: WaitUntilOptions): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 3_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  const hint = options?.description ?? 'predicate nunca ficou true'
  throw new Error(`waitUntil: timeout após ${timeoutMs}ms — ${hint}`)
}

export type WaitForScanStateOptions = WaitUntilOptions

/**
 * Espera o `currentScan` observável estar no estado dado (ex.: `processing` antes de confiar em `AbortSignal`).
 */
export async function waitForCurrentScanState(
  controller: Pick<ScanPipelineController, 'getCurrentScan'>,
  state: ScanState,
  options?: WaitForScanStateOptions,
): Promise<void> {
  await waitUntil(() => controller.getCurrentScan()?.state === state, {
    timeoutMs: options?.timeoutMs,
    description:
      options?.description ??
      `currentScan.state === '${state}' (obtido: ${JSON.stringify(controller.getCurrentScan()?.state)})`,
  })
}
