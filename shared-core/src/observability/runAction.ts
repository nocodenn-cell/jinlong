import { actionFail, actionOk, type ActionResult } from '../result/actionResult'
import { buildActionFailurePayload, logActionFailure } from './logFailure'
import type { LogFailureSink } from './types'

/**
 * Executa uma Promise e converte exceções em `ActionResult` + log estruturado.
 * Não altera fluxos que já retornam `ActionResult` — use só em novos endpoints ou após refatorar.
 */
export async function runActionWithObservability<T>(
  stage: string,
  fn: () => Promise<T>,
  sink?: LogFailureSink,
  event = 'action_unhandled_rejection',
): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return actionOk(data)
  } catch (err) {
    const payload = buildActionFailurePayload(stage, event, err)
    logActionFailure(sink, 'error', payload)
    const msg =
      err instanceof Error && err.message.trim()
        ? err.message
        : 'Não foi possível concluir esta operação. Tente de novo.'
    return actionFail(msg, { errorCode: 'UNKNOWN' })
  }
}
