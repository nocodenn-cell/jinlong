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

export type FormaPagamentoPagar = 'DINHEIRO' | 'PIX' | 'CARTAO' | 'BOLETO' | 'TRANSF'

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
