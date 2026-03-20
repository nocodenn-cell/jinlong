/**
 * Tipos do motor de preço (atacado / varejo) — domínio puro.
 */
export interface ResultadoPreco {
  precoUnitario: number
  precoOriginal: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'
  regraAplicadaId?: string
}

export interface RegraPreco {
  id: string
  tipoRegra: 'PRODUTO' | 'CATEGORIA'
  produtoId?: string
  categoriaId?: string
  quantidadeMinima: number
  quantidadeMaxima?: number
  tipoDesconto: 'PERCENTUAL' | 'VALOR_FIXO'
  valorDesconto: number
  dataValidade?: string
  ativo: boolean
}
