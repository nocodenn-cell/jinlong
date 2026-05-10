import { runActionWithObservability } from '../../../../shared-core/src/observability/runAction'
import type { LogFailureSink } from '../../../../shared-core/src/observability/types'
import { logger } from '../logger'

function createDesktopLogSink(): LogFailureSink {
  return (level, payload) => {
    const ctx: Record<string, unknown> = {
      stage: payload.stage,
      event: payload.event,
      error_message: payload.error_message,
      error_code: payload.error_code,
      ...payload.ctx,
    }
    if (level === 'error') {
      logger.error(`${payload.stage}/${payload.event}`, ctx)
    } else {
      logger.warn(`${payload.stage}/${payload.event}`, ctx)
    }
  }
}

/**
 * Comandos desktop (invoke, etc.): log via `logger` unificado + `ActionResult<T>`.
 */
export async function runDesktopActionWithObservability<T>(
  stage: string,
  fn: () => Promise<T>,
  event = 'action_unhandled_rejection',
) {
  return runActionWithObservability(stage, fn, createDesktopLogSink(), event)
}

export type { ActionResult } from '../../../../shared-core/src/result/actionResult'
export { actionOk, actionFail, isActionOk } from '../../../../shared-core/src/result/actionResult'
