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
 * Espelha, literalmente, o que a RPC `registrar_pagamento_contas_pagar` valida
 * — ela recusa qualquer outra com `PAGAMENTO_FORMA_INVALIDA`.
 *
 * **Por que `CARTAO` e nao `CARTAO_DEBITO`/`CARTAO_CREDITO`:** a distincao
 * debito x credito e do lado de quem RECEBE — define taxa de adquirente e prazo
 * de compensacao. Ao pagar fornecedor o dinheiro sai, nao ha adquirente nem
 * compensacao a receber. A Onda 2 tentou alinhar este tipo ao vocabulario de
 * vendas achando que era divergencia; era diferenca de dominio, e a RPC recusou.
 */
export type FormaPagamentoPagar = 'DINHEIRO' | 'PIX' | 'CARTAO' | 'BOLETO' | 'TRANSF'

/** As mesmas, em runtime — para validar o que vem do catalogo. */
export const FORMAS_PAGAMENTO_PAGAR: readonly FormaPagamentoPagar[] = [
  'DINHEIRO',
  'PIX',
  'CARTAO',
  'BOLETO',
  'TRANSF',
] as const

/** Estreita um codigo do catalogo ao contrato do AP, sem cast. */
export function isFormaPagamentoPagar(codigo: string): codigo is FormaPagamentoPagar {
  return (FORMAS_PAGAMENTO_PAGAR as readonly string[]).includes(codigo)
}

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
