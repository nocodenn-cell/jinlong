/**
 * Porta de persistência de produtos — implementação em lib/adapters/supabase.
 * O domínio não conhece Supabase.
 */
import { type StatusPublicacao } from '@shared-core/src/engine/productEngine'

export type { StatusPublicacao }

export type OrigemProduto = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

export type UnidadeMedida = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

export interface NovoProdutoInput {
  nome: string
  /** Opcional no cadastro rápido; persiste NULL se vazio (único só quando informado). */
  codigo_barras: string | null
  preco_varejo: number
  /** Preço atacado opcional (catálogo); exige quantidade mínima em pdv_config. */
  preco_atacado?: number | null
  /** Preço de custo opcional; base para a trava de margem (NULL = sem checagem). */
  preco_custo?: number | null
  /** Override: permite preço de venda abaixo do custo (ex.: liquidação). */
  permitir_abaixo_custo?: boolean
  /** Quantidade mínima de itens para acionar preço atacado. */
  quantidade_gatilho_atacado?: number | null
  origem: OrigemProduto
  tem_nf: boolean
  unidade_medida?: UnidadeMedida
  observacao?: string | null
  categoria_id?: string | null
  marca_id?: string | null
  fornecedor_id?: string | null
  /**
   * Legado CSV: `true` → PUBLICADO. Omitido → DRAFT (R1).
   * Preferir `status_publicacao` quando explícito.
   */
  ativo?: boolean
  status_publicacao?: StatusPublicacao
  /** NCM 8 dígitos — obrigatório pelo SEFAZ para NF-e/NFC-e (opcional no cadastro rápido). */
  ncm?: string | null
}

export interface PrecosAtacadoTierInput {
  produto_id: string
  loja_id: string | null
  quantidade_minima: number
  preco_unitario: number
  ativo: boolean
  permitir_abaixo_custo: boolean
}

export interface ProdutoRepositoryPort {
  createWithDefaultEstoque(input: NovoProdutoInput): Promise<
    { ok: true; id: string } | { ok: false; message: string }
  >
  createPrecosAtacadoTier(tier: PrecosAtacadoTierInput): Promise<
    { ok: true; id: string } | { ok: false; message: string }
  >
  updateAtivo(
    produtoId: string,
    ativo: boolean
  ): Promise<{ ok: true } | { ok: false; message: string }>
  updateStatusPublicacao(
    produtoId: string,
    status: StatusPublicacao
  ): Promise<{ ok: true } | { ok: false; message: string }>
}
