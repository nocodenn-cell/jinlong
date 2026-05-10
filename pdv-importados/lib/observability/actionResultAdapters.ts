import type { ActionResult } from '../../../shared-core/src/result/actionResult'
import { isActionOk } from '../../../shared-core/src/result/actionResult'

/** Padrão gerente com payload em `data` (ex.: estoque). */
export function actionResultToLegacyData<T>(
  r: ActionResult<T>,
): { success: true; data: T } | { success: false; error: string } {
  if (isActionOk(r)) return { success: true, data: r.data }
  return { success: false, error: r.error }
}

/** Transferências: mantém `transferenciaId` no topo (compat com UI e toasts). */
export function transferenciaActionResultToLegacy(
  r: ActionResult<{ transferenciaId: string }>,
):
  | { success: true; transferenciaId: string }
  | { success: false; error: string } {
  if (isActionOk(r)) return { success: true, transferenciaId: r.data.transferenciaId }
  return { success: false, error: r.error }
}
