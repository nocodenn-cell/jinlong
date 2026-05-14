/**
 * Cooperativa com `AbortSignal` do pipeline (ver docs/SCAN_HANDLER_ASYNC_CONTRACT.md).
 * Usa factory `() => Promise` para **não** iniciar I/O se o scan já estiver abortado.
 */

export type RaceWithScanAbortResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'aborted' }

/**
 * Corre `startWork()` em paralelo com o primeiro `abort` do `signal`.
 * Sem `signal`: comportamento equivalente a `await startWork()` apenas.
 */
export async function raceWithScanAbort<T>(
  signal: AbortSignal | undefined,
  startWork: () => Promise<T>,
): Promise<RaceWithScanAbortResult<T>> {
  if (!signal) {
    return { ok: true, value: await startWork() }
  }
  if (signal.aborted) {
    return { ok: false, reason: 'aborted' }
  }

  const work = startWork()
  const outcome = await Promise.race([
    work.then((value) => ({ kind: 'done' as const, value })),
    new Promise<{ kind: 'aborted' }>((resolve) => {
      signal.addEventListener('abort', () => resolve({ kind: 'aborted' }), { once: true })
    }),
  ])

  if (outcome.kind === 'aborted') {
    return { ok: false, reason: 'aborted' }
  }
  return { ok: true, value: outcome.value }
}
