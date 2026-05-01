/**
 * Tipos compartilhados para carrinho de compras
 */

export interface ItemCarrinho {
  id?: string
  produtoId: string
  quantidade: number
  precoVariejo: number
  metaPdv?: Record<string, any>
}

export interface MetaProdutoPdv {
  origem: 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
  tem_nf: boolean
  observacao?: string
  estoque_atual: number
  estoque_minimo: number
  categoriaId?: string
  precoAtacado?: number
}

export interface TotaisCarrinho {
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  totalUnidades: number
}
