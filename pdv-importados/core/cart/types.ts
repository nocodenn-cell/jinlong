/**
 * Tipos do carrinho — domínio puro (reutilizável no painel Next e no PDV Tauri).
 */

/** Metadados exibidos no PDV web (importados); não entram no cálculo de preço. */
export type MetaProdutoPdv = {
  origem: 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
  tem_nf: boolean
  observacao: string | null
  estoque_atual: number | null
  estoque_minimo: number | null
}

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
  metaPdv?: MetaProdutoPdv
}
