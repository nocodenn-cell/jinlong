/**
 * Porta de persistência de produtos — implementação em lib/adapters/supabase.
 * O domínio não conhece Supabase.
 */
export type OrigemProduto = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

export type UnidadeMedida = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

export interface NovoProdutoInput {
  nome: string
  /** Opcional no cadastro rápido; persiste NULL se vazio (único só quando informado). */
  codigo_barras: string | null
  preco_varejo: number
  /** Preço atacado opcional (catálogo); exige quantidade mínima em pdv_config. */
  preco_atacado?: number | null
  /** Quantidade mínima de itens para acionar preço atacado. */
  quantidade_gatilho_atacado?: number | null
  origem: OrigemProduto
  tem_nf: boolean
  unidade_medida?: UnidadeMedida
  observacao?: string | null
  categoria_id?: string | null
  marca_id?: string | null
  fornecedor_id?: string | null
  /** Se omitido, o repositório assume `true` (cadastro rápido). Importação CSV pode enviar `false`. */
  ativo?: boolean
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
