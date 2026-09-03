/**
 * Porta de persistência de produtos — implementação em lib/adapters/supabase.
 * O domínio não conhece Supabase.
 */
export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'

export type OrigemProduto = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

export type UnidadeMedida = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

export interface NovoProdutoInput {
  nome: string
  /** Opcional no cadastro rápido; persiste NULL se vazio (único só quando informado). */
  codigo_barras: string | null
  /** Código interno / SKU do produto (opcional). */
  codigo_interno?: string | null
  /** Referência do produto no catálogo do fornecedor (opcional). */
  referencia_fornecedor?: string | null
  /** Nome curto opcional para exibição compacta no PDV (cupom/tela de venda). */
  nome_reduzido_pdv?: string | null
  /** Localização física na loja (ex.: "A-12"); apenas informativo. */
  localizacao_prateleira?: string | null
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
  /** NCM 8 dígitos — obrigatório pelo SEFAZ para NF-e/NFC-e (opcional no cadastro). */
  ncm?: string | null
  cfop_produto?: string | null
  csosn?: string | null
  cest?: string | null
  cst_pis?: string | null
  cst_cofins?: string | null
  /** Código de origem ICMS Focus ('0'..'8'). SEM default — não deriva de `origem`. */
  icms_origem?: string | null
  /** Quantidade inicial (opcional) — aplicada na mesma TX do create (RPC 270). */
  estoque_inicial_quantidade?: number
  /** Estoque mínimo inicial (opcional) — mesma TX. */
  estoque_inicial_minimo?: number
  /** Idempotência de retry do cadastro (UUID do client). */
  client_request_id?: string | null
}

export interface ProdutoRepositoryPort {
  createWithDefaultEstoque(input: NovoProdutoInput): Promise<
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
