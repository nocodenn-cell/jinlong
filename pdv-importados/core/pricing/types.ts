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

/** Parâmetros globais do motor de preço (ex.: mínimo para usar `preco_atacado` do produto). */
export interface PricingContext {
  quantidadeMinimaAtacadoPadrao: number
}

export const DEFAULT_PRICING_CONTEXT: PricingContext = {
  quantidadeMinimaAtacadoPadrao: 6,
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
