import { logCaughtServerError } from '@/lib/logging/server-error'
import { logJson } from '@/shared/unified-logger'
import { runActionWithObservability } from '../../../shared-core/src/observability/runAction'
import type { LogFailureSink } from '../../../shared-core/src/observability/types'
import { addVendaBreadcrumb, reportVendaError } from './vendaSentryRouter'
import { redigir } from './redact'

function createServerLogSink(): LogFailureSink {
  return (level, payload) => {
    const synthetic = new Error(payload.error_message)
    synthetic.name = `${payload.stage}:${payload.event}`
    if (level === 'error') {
      logCaughtServerError(`${payload.stage}/${payload.event}`, synthetic)
      reportVendaError(payload.stage, payload.event, synthetic, {
        layer: 'web',
        error_code: payload.error_code,
        trace_id: payload.ctx?.trace_id as string | undefined,
        venda_id: payload.ctx?.venda_id as string | null | undefined,
        caixa_id: payload.ctx?.caixa_id as string | undefined,
      })
    } else {
      // O payload inteiro ia para o log e o `ctx` para o breadcrumb, ambos sem
      // filtro — era a via mais direta de vazamento de dado de cliente.
      logJson('server-action-warn', redigir({ ...payload }) as Record<string, unknown>)
      addVendaBreadcrumb(payload.stage, payload.event, redigir(payload.ctx) as Record<string, unknown>)
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
