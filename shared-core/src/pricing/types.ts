/**
 * Tipos compartilhados para precificação.
 */
export interface RegraPreco {
  id: string
  nome: string
  tipo: 'ATAcado' | 'VAREJO' | 'PROMOCAO'
  minQuantidade?: number
  maxQuantidade?: number
  quantidadeMinima?: number
  quantidadeMaxima?: number
  descontoPercentual?: number
  valorDesconto?: number
  precoFixo?: number
  produtoId?: string
  categoriaId?: string
  dataValidade?: string | null
  ativo: boolean
}

export interface ResultadoPreco {
  precoUnitario: number
  precoOriginal: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
}

export interface PricingContext {
  lojaId?: string
  perfilUsuario?: 'OPERADOR' | 'GERENTE' | 'DONO' | 'ADMIN'
  dataReferencia?: Date
  quantidadeMinimaAtacadoPadrao?: number
}

export const DEFAULT_PRICING_CONTEXT: PricingContext = {
  perfilUsuario: 'OPERADOR',
  quantidadeMinimaAtacadoPadrao: 10,
}
