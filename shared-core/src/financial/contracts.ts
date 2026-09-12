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
  lojaId: string
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

export type ReverseReceivableCommand = {
  liquidacaoId: string
  motivo: string
  idempotencyKey: string
}

export type ReverseReceivableResult =
  | { ok: true; estornoId: string; idempotentReplay: boolean }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type ReceivableLiquidationService = {
  liquidate(command: LiquidateReceivableCommand): Promise<LiquidateReceivableResult>
  /** P1-4: estorno auditável (append-only) de uma liquidação já registrada. */
  reverse(command: ReverseReceivableCommand): Promise<ReverseReceivableResult>
}

export type ReceivableLiquidacaoRow = {
  id: string
  tituloId: TituloId
  valor: number
  formaPagamento: string
  createdAt: string
  operacaoTipo: 'RECEBIMENTO' | 'ESTORNO' | null
  operacaoOrigemId: string | null
}

export type ListLiquidacoesQuery = { tituloId: TituloId }

export type ListLiquidacoesResult =
  | { ok: true; liquidacoes: ReceivableLiquidacaoRow[] }
  | { ok: false; error: string; code?: FinancialErrorCode }

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

/**
 * Uma linha do histórico de um título a pagar (`contas_pagar_pagamentos`).
 * Espelha `ReceivableLiquidacaoRow` — o ledger de AP é append-only pelo mesmo
 * desenho do de AR: o estorno é uma linha nova apontando para a de origem,
 * nunca um DELETE.
 */
export type PayablePagamentoRow = {
  id: string
  contaId: ContaPagarId
  valor: number
  formaPagamento: string
  dataPagamento: string
  createdAt: string
  observacao: string | null
  operacaoTipo: 'PAGAMENTO' | 'ESTORNO' | null
  operacaoOrigemId: string | null
}

export type ListPagamentosPagarQuery = { contaId: ContaPagarId }

export type ListPagamentosPagarResult =
  | { ok: true; pagamentos: PayablePagamentoRow[] }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type PayableReader = {
  list(query: ListPayablesQuery): Promise<ListPayablesResult>
  /** Histórico de pagamentos e estornos de um título. */
  listPagamentos(query: ListPagamentosPagarQuery): Promise<ListPagamentosPagarResult>
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
  /**
   * P1-4: o cancelamento passou a ser transacional e estorna os pagamentos já
   * realizados, então precisa de chave de idempotência como qualquer outro
   * comando financeiro.
   */
  idempotencyKey: string
}

export type ReversePayableCommand = {
  pagamentoId: string
  motivo: string
  idempotencyKey: string
}

export type ReversePayableResult =
  | {
      ok: true
      estornoId: string
      idempotentReplay: boolean
      /** Estado do título depois do estorno — evita um re-fetch só para o badge. */
      status: string
      valorPago: number
    }
  | { ok: false; error: string; code?: FinancialErrorCode }

export type PayablePaymentService = {
  pay(command: PayPayableCommand): Promise<PayPayableResult>
  cancel(command: CancelPayableCommand): Promise<CancelPayableResult>
  /** Estorno auditável (append-only) de um pagamento já registrado — espelha AR. */
  reverse(command: ReversePayableCommand): Promise<ReversePayableResult>
}

/** Tipagem de leitura AR — inclui nome do cliente para listagem UI. */
export type ReceivableListRow = ReceivableTitle & {
  clienteNome: string | null
}

/**
 * Situação pedida na listagem a receber.
 *
 * `mix` (padrão) = tudo que ainda pede ação: ABERTO + PARCIAL. Era a ÚNICA
 * coisa que a tela sabia pedir — título quitado e cancelado simplesmente
 * desapareciam da lista, sem filtro que os trouxesse de volta. As três opções
 * novas espelham os chips de Contas a Pagar.
 *
 * `atrasado` não é status persistido: é ABERTO/PARCIAL com vencimento < hoje
 * (item 13 do Plano Mestre).
 */
export type ReceivableOpcao =
  | 'mix'
  | 'ABERTO'
  | 'PARCIAL'
  | 'atrasado'
  | 'QUITADO'
  | 'CANCELADO'
  | 'todos'

export type ListReceivablesQuery = {
  opcao: ReceivableOpcao
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
  listLiquidacoes(query: ListLiquidacoesQuery): Promise<ListLiquidacoesResult>
}
