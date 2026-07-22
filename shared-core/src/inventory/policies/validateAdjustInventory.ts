/**
 * Policy pura — validação de ajuste manual (espelho de critérios da RPC).
 * Não chama Postgres; não calcula saldo.
 */

import {
  INVENTORY_ADJUST_REASONS,
  INVENTORY_ERROR_CODES,
  type InventoryAdjustReason,
  type InventoryErrorCode,
} from '../errorCodes'
import type { AdjustInventoryCommand } from '../contracts'

export type ValidateAdjustResult =
  | { ok: true; command: AdjustInventoryCommand }
  | { ok: false; code: InventoryErrorCode }

function isAdjustReason(value: string): value is InventoryAdjustReason {
  return (INVENTORY_ADJUST_REASONS as readonly string[]).includes(value)
}

/**
 * Valida comando de ajuste antes do adapter chamar `ajustar_estoque_manual`.
 * Congela: qty/min ≥ 0; motivo do catálogo; OUTRO exige observação.
 */
export function validateAdjustInventoryCommand(
  command: AdjustInventoryCommand,
): ValidateAdjustResult {
  if (!command.productId?.trim()) {
    return { ok: false, code: INVENTORY_ERROR_CODES.NOT_FOUND }
  }
  if (!command.lojaId?.trim()) {
    return { ok: false, code: INVENTORY_ERROR_CODES.LOJA_REQUIRED }
  }
  if (!Number.isFinite(command.quantity) || command.quantity < 0) {
    return { ok: false, code: INVENTORY_ERROR_CODES.QTY_INVALID }
  }
  if (
    command.estoqueMinimo !== undefined &&
    (!Number.isFinite(command.estoqueMinimo) || command.estoqueMinimo < 0)
  ) {
    return { ok: false, code: INVENTORY_ERROR_CODES.MIN_INVALID }
  }
  const reason = (command.reason ?? '').trim()
  if (!isAdjustReason(reason)) {
    return { ok: false, code: INVENTORY_ERROR_CODES.REASON_INVALID }
  }
  if (reason === 'OUTRO' && !(command.observacao ?? '').trim()) {
    return { ok: false, code: INVENTORY_ERROR_CODES.OBS_REQUIRED }
  }
  return {
    ok: true,
    command: {
      ...command,
      reason,
      observacao: command.observacao?.trim() || null,
    },
  }
}
