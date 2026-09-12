/**
 * Tipos de domínio — financial (AR/AP).
 * ADR-010. Sem I/O. Cash físico fica em `shared-core/cash`.
 */

export type TituloId = string
export type ContaPagarId = string
export type ClienteId = string
export type FornecedorId = string

export type FormaPagamentoReceber =
  | 'DINHEIRO'
  | 'PIX'
  | 'CARTAO_DEBITO'
  | 'CARTAO_CREDITO'
  | 'OUTROS'

/**
 * Formas aceitas ao pagar um fornecedor.
 *
 * `CARTAO_DEBITO` e `CARTAO_CREDITO` entraram na Onda 2 para alinhar o Contas a
 * Pagar ao vocabulario canonico do resto do sistema (`vendas`,
 * `vendas_pagamentos`, `devolucoes`, `liquidacoes_receber`). `CARTAO` continua
 * no tipo porque continua valido no banco: ha historico gravado com ele e
 * remover seria estreitar, nao unificar.
 */
export type FormaPagamentoPagar =
  | 'DINHEIRO'
  | 'PIX'
  | 'CARTAO'
  | 'CARTAO_DEBITO'
  | 'CARTAO_CREDITO'
  | 'BOLETO'
  | 'TRANSF'

/** Escopo de uma forma no catalogo `formas_pagamento`. */
export type EscopoFormaPagamento = 'RECEBER' | 'PAGAR' | 'AMBOS'

/** Uma forma do cadastro, como as telas a consomem. */
export type FormaPagamentoCatalogo = {
  codigo: string
  nome: string
  escopo: EscopoFormaPagamento
  taxaPercentual: number
  prazoCompensacaoDias: number
}

export type ReceivableTitle = {
  tituloId: TituloId
  clienteId: ClienteId
  valorTotal: number
  valorAberto: number
  descricao: string | null
  vencimento: string | null
  status: string
  lojaId: string
  /**
   * Venda que originou o título, quando houve uma (`contas_receber.venda_id`).
   * Título lançado à mão não tem origem — daí ser anulável.
   */
  vendaId: string | null
  /** Computado na leitura (vencimento < hoje, status em aberto) — nunca persistido. */
  atrasado: boolean
}

export type PayableTitle = {
  contaId: ContaPagarId
  fornecedorId: FornecedorId
  fornecedorNome: string | null
  descricao: string
  valorTotal: number
  valorPago: number
  vencimento: string | null
  status: string
  /** Número da NF-e de origem, lido da importação vinculada. */
  nfeNumero: string | null
  /** Número da parcela/duplicata dentro da nota, quando informado. */
  nfeParcela?: string | null
  nfeImportacaoId: string | null
  criadoEm: string | null
  lojaId: string
  /** Computado na leitura (vencimento < hoje, status em aberto) — nunca persistido. */
  atrasado: boolean
}
