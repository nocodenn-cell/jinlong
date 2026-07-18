/**
 * Domínio inventory (saldo físico / kardex) — barrel público.
 * Missão Inventory 2 / ADR-008.
 *
 * Apps importam daqui. Sem I/O, sem cálculo de saldo, sem autoridade paralela.
 * Writers/ajustes: ports tipados — implementação em Inventory 3+.
 */

export type {
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  LojaId,
  MovementId,
  ProductId,
} from './types'

export type {
  AdjustInventoryCommand,
  AdjustInventoryResult,
  InventoryAdjustmentService,
  InventoryBalanceResult,
  InventoryBalancesResult,
  InventoryMovementWriter,
  InventoryReader,
  RegisterMovementCommand,
  RegisterMovementResult,
} from './contracts'
