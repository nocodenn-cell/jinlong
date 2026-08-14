import type { FinancialErrorCode } from './errorCodes'
import type {
  ClienteId,
  ContaPagarId,
  FormaPagamentoPagar,
  FormaPagamentoReceber,
  PayableTitle,
  ReceivableTitle,
  TituloId,
} from './types'

export type CreateReceivableCommand = {
  clienteId: ClienteId
  valorTotal: number
  descricao?: string | null
  vencimento?: string | null
}

export type CreateReceivableResult =
  | { ok: true; tituloId: TituloId }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type ReceivableWriter = {
  create(command: CreateReceivableCommand): Promise<CreateReceivableResult>
}

export type LiquidateReceivableCommand = {
  tituloId: TituloId
  valor: number
  formaPagamento: FormaPagamentoReceber
  observacao?: string | null
  idempotencyKey: string
  caixaId?: string | null
}

export type LiquidateReceivableResult =
  | { ok: true; liquidacaoId: string; idempotentReplay: boolean; caixaId?: string | null }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type ReceivableLiquidationService = {
  liquidate(command: LiquidateReceivableCommand): Promise<LiquidateReceivableResult>
}

export type ListPayablesQuery = {
  page: number
  status?: string
  fornecedorId?: string
  periodo?: string
  termo?: string
}

export type ListPayablesResult =
  | { ok: true; contas: PayableTitle[]; hasMore: boolean }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type PayableReader = {
  list(query: ListPayablesQuery): Promise<ListPayablesResult>
}

export type PayPayableCommand = {
  contaId: ContaPagarId
  valor: number
  formaPagamento: FormaPagamentoPagar
  /** ISO — espelho da action legada. */
  data: string
  observacao?: string | null
  idempotencyKey: string
  caixaId?: string | null
  autorizacaoToken?: string | null
}

export type PayPayableResult =
  | { ok: true; pagamentoId: string; idempotentReplay: boolean; caixaId: string | null; movimentacaoCaixaId: string | null }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type CancelPayableResult =
  | { ok: true }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type CancelPayableCommand = {
  contaId: ContaPagarId
  motivo: string
}

export type PayablePaymentService = {
  pay(command: PayPayableCommand): Promise<PayPayableResult>
  cancel(command: CancelPayableCommand): Promise<CancelPayableResult>
}

/** Tipagem de leitura AR — inclui nome do cliente para listagem UI. */
export type ReceivableListRow = ReceivableTitle & {
  clienteNome: string | null
}

export type ListReceivablesQuery = {
  opcao: 'mix' | 'ABERTO' | 'PARCIAL'
  nomeCliente: string
  q: string
  de: string
  ate: string
  limite: number
}

export type ListReceivablesResult =
  | { ok: true; titulos: ReceivableListRow[]; capped: boolean }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type ReceivableReader = {
  list(query: ListReceivablesQuery): Promise<ListReceivablesResult>
}
