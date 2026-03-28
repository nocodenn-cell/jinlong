/**
 * Porta de persistência de produtos — implementação em lib/adapters/supabase.
 * O domínio não conhece Supabase.
 */
export type OrigemProduto = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

export interface NovoProdutoInput {
  nome: string
  /** Opcional no cadastro rápido; persiste NULL se vazio (único só quando informado). */
  codigo_barras: string | null
  preco_varejo: number
  origem: OrigemProduto
  tem_nf: boolean
}

export interface ProdutoRepositoryPort {
  createWithDefaultEstoque(input: NovoProdutoInput): Promise<
    { ok: true; id: string } | { ok: false; message: string }
  >
  updateAtivo(
    produtoId: string,
    ativo: boolean
  ): Promise<{ ok: true } | { ok: false; message: string }>
}
