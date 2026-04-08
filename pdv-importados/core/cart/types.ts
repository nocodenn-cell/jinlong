/**
 * Tipos do carrinho — domínio puro (reutilizável no painel Next e no PDV Tauri).
 */
export interface ItemCarrinho {
  /** id único da linha no carrinho (não confundir com produtoId) */
  id: string
  produtoId: string
  nome: string
  quantidade: number
  /** preço base varejo do produto */
  precoVariejo: number
  /** preço atacado do catálogo (opcional); exige quantidade mínima em `PricingContext` */
  precoAtacado?: number | null
  categoriaId?: string
}
