/**
 * Códigos estáveis do domínio inventory — a borda resolve para i18n.
 * Policies emitem só `code`; sem string de idioma no core.
 * Espelha codes da RPC `ajustar_estoque_manual_seguro` quando aplicável.
 */

export const INVENTORY_ERROR_CODES = {
  NOT_FOUND: 'INVENTORY_NOT_FOUND',
  AUTH_REQUIRED: 'INVENTORY_AUTH_REQUIRED',
  LOJA_REQUIRED: 'INVENTORY_LOJA_REQUIRED',
  LOJA_MISMATCH: 'INVENTORY_LOJA_MISMATCH',
  QTY_INVALID: 'INVENTORY_QTY_INVALID',
  MIN_INVALID: 'INVENTORY_MIN_INVALID',
  REASON_INVALID: 'INVENTORY_REASON_INVALID',
  REASON_SIGN_MISMATCH: 'INVENTORY_REASON_SIGN_MISMATCH',
  OBS_REQUIRED: 'INVENTORY_OBS_REQUIRED',
  PROFILE_DENIED: 'INVENTORY_PROFILE_DENIED',
  INSUFFICIENT: 'INVENTORY_INSUFFICIENT',
  TRANSFER_SAME_STORE: 'INVENTORY_TRANSFER_SAME_STORE',
  TRANSFER_KEY_REQUIRED: 'INVENTORY_TRANSFER_KEY_REQUIRED',
  REMESSA_ID_REQUIRED: 'INVENTORY_REMESSA_ID_REQUIRED',
  NFE_PAYLOAD_INVALID: 'INVENTORY_NFE_PAYLOAD_INVALID',
  ADJUST_FAILED: 'INVENTORY_ADJUST_FAILED',
  STALE_BALANCE: 'INVENTORY_STALE_BALANCE',
  MOVEMENT_FAILED: 'INVENTORY_MOVEMENT_FAILED',
  LIST_FAILED: 'INVENTORY_LIST_FAILED',
  READ_FAILED: 'INVENTORY_READ_FAILED',
  UNKNOWN: 'INVENTORY_UNKNOWN',
} as const

export type InventoryErrorCode =
  (typeof INVENTORY_ERROR_CODES)[keyof typeof INVENTORY_ERROR_CODES]

/** Params opcionais para templates (ex.: {{disponivel}}). */
export type InventoryErrorParams = {
  disponivel?: string
  solicitado?: string
  limite?: string
}

/**
 * Motivos aceitos pelo ajuste manual (espelho da RPC — não inventar novos).
 */
export const INVENTORY_ADJUST_REASONS = [
  'COMPRA',
  'PERDA',
  'QUEBRA',
  'ACERTO_INVENTARIO',
  'OUTRO',
] as const

export type InventoryAdjustReason = (typeof INVENTORY_ADJUST_REASONS)[number]

/**
 * Motivo coerente com o sinal do ajuste (espelho da RPC): PERDA/QUEBRA só
 * reduzem saldo; COMPRA só aumenta. Delta 0 (só mínimo) aceita qualquer motivo.
 */
export function motivoCompativelComDelta(reason: string, delta: number): boolean {
  if (!Number.isFinite(delta) || delta === 0) return true
  if (delta > 0) return reason !== 'PERDA' && reason !== 'QUEBRA'
  return reason !== 'COMPRA'
}

/** Mapeia fragmento de erro RPC → code de domínio. */
export function mapAjusteRpcMessageToCode(detalhe: string): InventoryErrorCode {
  const raw = (detalhe ?? '').trim()
  if (raw.includes('AJUSTE_ESTOQUE_SALDO_ALTERADO') || raw.includes('AJUSTE_ESTOQUE_SNAPSHOT_OBRIGATORIO')) {
    return INVENTORY_ERROR_CODES.STALE_BALANCE
  }
  if (raw.includes('AJUSTE_ESTOQUE_AUTH')) return INVENTORY_ERROR_CODES.AUTH_REQUIRED
  if (raw.includes('AJUSTE_ESTOQUE_PERFIL')) return INVENTORY_ERROR_CODES.PROFILE_DENIED
  if (raw.includes('AJUSTE_ESTOQUE_LOJA_INVALIDA')) return INVENTORY_ERROR_CODES.LOJA_MISMATCH
  if (raw.includes('AJUSTE_ESTOQUE_QTD_INVALIDA')) return INVENTORY_ERROR_CODES.QTY_INVALID
  if (raw.includes('AJUSTE_ESTOQUE_MIN_INVALIDO')) return INVENTORY_ERROR_CODES.MIN_INVALID
  if (raw.includes('AJUSTE_ESTOQUE_MOTIVO_SINAL_INVALIDO')) {
    return INVENTORY_ERROR_CODES.REASON_SIGN_MISMATCH
  }
  if (raw.includes('AJUSTE_ESTOQUE_MOTIVO_INVALIDO')) return INVENTORY_ERROR_CODES.REASON_INVALID
  if (raw.includes('AJUSTE_ESTOQUE_OBSERVACAO_OBRIGATORIA')) {
    return INVENTORY_ERROR_CODES.OBS_REQUIRED
  }
  if (raw.includes('AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA')) {
    return INVENTORY_ERROR_CODES.NOT_FOUND
  }
  if (raw.includes('ESTOQUE_INSUFICIENTE')) return INVENTORY_ERROR_CODES.INSUFFICIENT
  return INVENTORY_ERROR_CODES.ADJUST_FAILED
}
