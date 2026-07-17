/**
 * Porta de leitura de composição de kit — implementação em
 * lib/adapters/supabase. O domínio (InventoryExpansionService) não conhece
 * Supabase nem a RPC `obter_kit_composicao_atual`.
 */
export type ComponenteKit = {
  produtoId: string
  quantidade: number
}

export type KitComposicaoAtual = {
  composicaoId: string
  versao: number
  componentes: ComponenteKit[]
}

export interface KitComposicaoRepositoryPort {
  /** Composição ativa (versão vigente) de um kit, ou null se não é kit / sem composição. */
  obterComposicaoAtual(kitProdutoId: string): Promise<KitComposicaoAtual | null>
}
