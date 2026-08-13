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
  nfeNumero: string | null
  nfeImportacaoId: string | null
  criadoEm: string | null
}
