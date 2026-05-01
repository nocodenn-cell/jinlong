/**
 * Tipos compartilhados para precificação
 */

export interface RegraPreco {
  id: string
  nome: string
  tipo: 'ATAcado' | 'VAREJO' | 'PROMOCAO'
  minQuantidade?: number
  maxQuantidade?: number
  descontoPercentual?: number
  precoFixo?: number
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
