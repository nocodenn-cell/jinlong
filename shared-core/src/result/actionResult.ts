/**
 * Contrato unificado de retorno para actions / comandos mutacionais.
 * Migração gradual: coexistir com `{ success: boolean }` e `{ ok: boolean }` legados.
 */

export type ActionOk<T> = { ok: true; data: T }

export type ActionErr = {
  ok: false
  error: string
  /** Código estável para telemetria / suporte (opcional). */
  errorCode?: ActionErrorCode
}

export type ActionResult<T> = ActionOk<T> | ActionErr

/** Códigos canônicos — expandir conforme migração das actions. */
export type ActionErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_FAILED'
  | 'NETWORK'
  | 'RPC_ERROR'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_REPLAY'
  | 'OFFLINE'
  | 'UNKNOWN'

export function actionOk<T>(data: T): ActionOk<T> {
  return { ok: true, data }
}

export function actionFail(error: string, opts?: { errorCode?: ActionErrorCode }): ActionErr {
  return { ok: false, error, errorCode: opts?.errorCode ?? 'UNKNOWN' }
}

/** Converte `{ success: true, data }` → `ActionResult`. */
export function fromLegacySuccess<T>(r: { success: true; data: T }): ActionOk<T> {
  return { ok: true, data: r.data }
}

/** Converte `{ success: false, error }` → `ActionResult` (sem código). */
export function fromLegacyFailure(r: { success: false; error: string }): ActionErr {
  return { ok: false, error: r.error, errorCode: 'UNKNOWN' }
}

export function isActionOk<T>(r: ActionResult<T>): r is ActionOk<T> {
  return r.ok === true
}
