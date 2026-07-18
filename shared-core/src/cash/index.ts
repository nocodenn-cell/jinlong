/**
 * Domínio cash (turno físico) — barrel público.
 * ADR-009 · ADR-CAIXA-002
 * Não confundir com `shared-core/caixa` (helpers PDV).
 */

export type {
  CaixaId,
  CashMovement,
  CashMovementStatus,
  CashMovementType,
  CashSession,
  CashSessionStatus,
  LojaId,
  MovimentacaoId,
  OperadorId,
} from './types'

export type { CashErrorCode } from './errorCodes'
export { CASH_ERROR_CODES } from './errorCodes'

export type {
  CashMovementReader,
  CashMovementWriter,
  CashSessionReader,
  CashSessionStatusResult,
  CashSessionWriter,
  CloseCashSessionCommand,
  CloseCashSessionResult,
  ListCashMovementsResult,
  OpenCashSessionCommand,
  OpenCashSessionResult,
  RegisterCashMovementCommand,
  RegisterCashMovementResult,
} from './contracts'

export type { ValidateCashResult } from './policies/validateCashSession'
export {
  validateCashMoneyValue,
  validateCloseMotivo,
  validateMovementInput,
} from './policies/validateCashSession'
