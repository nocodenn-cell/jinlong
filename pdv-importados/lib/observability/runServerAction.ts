import { logCaughtServerError } from '@/lib/logging/server-error'
import { logJson } from '@/shared/unified-logger'
import { runActionWithObservability } from '../../../shared-core/src/observability/runAction'
import type { LogFailureSink } from '../../../shared-core/src/observability/types'

function createServerLogSink(): LogFailureSink {
  return (level, payload) => {
    const synthetic = new Error(payload.error_message)
    synthetic.name = `${payload.stage}:${payload.event}`
    if (level === 'error') {
      logCaughtServerError(`${payload.stage}/${payload.event}`, synthetic)
    } else {
      logJson('server-action-warn', { ...payload } as Record<string, unknown>)
    }
  }
}

/**
 * Server Actions / rotas Next: envolve `fn` com try/catch, log estruturado no stderr
 * (via `logCaughtServerError`) e retorno `ActionResult<T>`.
 * Use em novos fluxos; migração gradual das actions legadas.
 */
export async function runServerActionWithObservability<T>(
  stage: string,
  fn: () => Promise<T>,
  event = 'action_unhandled_rejection',
) {
  return runActionWithObservability(stage, fn, createServerLogSink(), event)
}

export type { ActionResult, ActionErr, ActionOk } from '../../../shared-core/src/result/actionResult'
export {
  actionOk,
  actionFail,
  isActionOk,
  fromLegacySuccess,
  fromLegacyFailure,
} from '../../../shared-core/src/result/actionResult'
