/**
 * Domínio inventory (saldo físico / kardex) — barrel público.
 * ADR-008 · Inventory 2–100
 *
 * Leitura: InventoryReader · InventoryMovementReader · InventoryQueryService
 * Escrita: InventoryAdjustmentService · InventoryMovementWriter
 */

export type {
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockListOrdem,
  InventoryStockListRow,
  InventoryStockListVisao,
  LojaId,
  MovementId,
  ProductId,
} from './types'

export type {
  InventoryAdjustReason,
  InventoryErrorCode,
  InventoryErrorParams,
} from './errorCodes'
export {
  INVENTORY_ADJUST_REASONS,
  INVENTORY_ERROR_CODES,
  mapAjusteRpcMessageToCode,
} from './errorCodes'

export type {
  AdjustInventoryCommand,
  AdjustInventoryResult,
  ConfirmarImportacaoNfeCommand,
  ConfirmarImportacaoNfeResult,
  ConfirmRemessaCommand,
  ConfirmRemessaResult,
  ImportNfeCommand,
  ImportNfeResult,
  InventoryAdjustmentService,
  InventoryBalanceResult,
  InventoryBalancesResult,
  InventoryMovementReader,
  InventoryMovementWriter,
  InventoryQueryService,
  InventoryReader,
  InventoryStockListQuery,
  InventoryStockListResult,
  ListMovementsByProductQuery,
  ListMovementsByProductResult,
  ReceiveOrdemCompraCommand,
  ReceiveOrdemCompraResult,
  RegisterMovementCommand,
  RegisterMovementResult,
  RegistrarConferenciaNfeCommand,
  RegistrarConferenciaNfeResult,
  RegistrarConferenciaRemessaCommand,
  RegistrarConferenciaRemessaResult,
  TransferStockCommand,
  TransferStockResult,
} from './contracts'

export type { ValidateAdjustResult } from './policies/validateAdjustInventory'
export { validateAdjustInventoryCommand } from './policies/validateAdjustInventory'

export type {
  ItemConferencia,
  RecebimentoOrigem,
  RecebimentoStatus,
} from './policies/recebimentoStatus'
export {
  RECEBIMENTO_ORIGENS,
  RECEBIMENTO_STATUS,
  RECEBIMENTO_TRANSITIONS,
  contarDivergencias,
  isRecebimentoFinalizado,
  podeConferirRecebimento,
  podeConfirmarRecebimento,
  podeTransicionarRecebimento,
  statusAposConferencia,
  temItemNaoConferido,
} from './policies/recebimentoStatus'
