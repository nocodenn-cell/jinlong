/**
 * Domínio financial (AR/AP) — barrel público.
 * ADR-010
 */

export {
  FORMAS_PAGAMENTO_PAGAR,
  FORMAS_PAGAMENTO_RECEBER,
  isFormaPagamentoPagar,
  isFormaPagamentoReceber,
} from './types'

export type {
  ClienteId,
  ContaPagarId,
  FormaPagamentoPagar,
  EscopoFormaPagamento,
  FormaPagamentoCatalogo,
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
  ListLiquidacoesQuery,
  ListLiquidacoesResult,
  ListPagamentosPagarQuery,
  ListPagamentosPagarResult,
  ListPayablesQuery,
  ListPayablesResult,
  ListReceivablesQuery,
  ListReceivablesResult,
  PayPayableCommand,
  PayPayableResult,
  PayablePagamentoRow,
  PayablePaymentService,
  PayableReader,
  ReceivableLiquidacaoRow,
  ReceivableLiquidationService,
  ReceivableListRow,
  ReceivableOpcao,
  ReceivableReader,
  ReceivableWriter,
  ReversePayableCommand,
  ReversePayableResult,
  ReverseReceivableCommand,
  ReverseReceivableResult,
} from './contracts'

export type { ValidateFinancialResult } from './policies/validateReceivable'
export {
  validateCreateReceivableInput,
  validateLiquidateReceivableInput,
} from './policies/validateReceivable'

export { hojeYmd, isTituloVencido } from './policies/tituloVencido'

export type { SituacaoTitulo, SituacaoTituloInput } from './policies/situacaoTitulo'
export {
  saldoTitulo,
  situacaoAtrasada,
  situacaoEmAberto,
  situacaoTitulo,
} from './policies/situacaoTitulo'
