/**
 * Domínio financial (AR/AP) — barrel público.
 * ADR-010
 */

export type {
  ClienteId,
  ContaPagarId,
  FormaPagamentoPagar,
  FormaPagamentoReceber,
  FornecedorId,
  PayableTitle,
  ReceivableTitle,
  TituloId,
} from './types'

export type { FinancialErrorCode } from './errorCodes'
export { FINANCIAL_ERROR_CODES } from './errorCodes'

export type {
  CancelPayableCommand,
  CancelPayableResult,
  CreateReceivableCommand,
  CreateReceivableResult,
  LiquidateReceivableCommand,
  LiquidateReceivableResult,
  ListPayablesQuery,
  ListPayablesResult,
  ListReceivablesQuery,
  ListReceivablesResult,
  PayPayableCommand,
  PayPayableResult,
  PayablePaymentService,
  PayableReader,
  ReceivableLiquidationService,
  ReceivableListRow,
  ReceivableReader,
  ReceivableWriter,
} from './contracts'

export type { ValidateFinancialResult } from './policies/validateReceivable'
export {
  validateCreateReceivableInput,
  validateLiquidateReceivableInput,
} from './policies/validateReceivable'
