/**
 * Tipos de domínio — products (catálogo / SKU).
 * Missão Products 2 — scaffold. Sem I/O, sem React/Next, sem cálculo de preço.
 * Autoridade de preço efetivo: Postgres `calcular_preco_produto` (ADR-007).
 */

/** Identificador estável do SKU (`produtos.id`). */
export type ProductId = string

/** Ciclo de vida de publicação — alinhado a `produtos.status_publicacao`. */
export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'

/** Origem do cadastro — alinhado a `produtos.origem`. */
export type OrigemProduto = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

/** Unidade de medida de catálogo. */
export type UnidadeMedida = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

/**
 * Identidade mínima do produto — leitura cross-domínio (sales, PDV).
 * Não inclui saldo de estoque (dono: inventory).
 */
export type ProductIdentity = {
  id: ProductId
  /** Código de barras persistido (`produtos.codigo_barras`). */
  codigoBarras: string | null
  codigoInterno: string | null
  nome: string
  lojaId: string
  ativo: boolean
  statusPublicacao: StatusPublicacao
}

/**
 * Dados básicos de catálogo para consulta (além da identidade).
 * Preços aqui são de **cadastro**, não preço efetivo da venda.
 */
export type ProductCatalogBasics = ProductIdentity & {
  precoVarejo: number
  precoAtacado: number | null
  precoCusto: number | null
  categoriaId: string | null
  marcaId: string | null
  fornecedorId: string | null
  imagemUrl: string | null
}

/**
 * Campos de catálogo compartilhados create/update (sem estoque).
 * Espelham o formulário legado sem amarrar nomes de coluna SQL no core.
 */
export type ProductCatalogWriteFields = {
  nome: string
  codigoBarras?: string | null
  codigoInterno?: string | null
  referenciaFornecedor?: string | null
  nomeReduzidoPdv?: string | null
  localizacaoPrateleira?: string | null
  precoVarejo: number
  precoAtacado?: number | null
  precoCusto?: number | null
  permitirAbaixoCusto?: boolean
  quantidadeGatilhoAtacado?: number | null
  origem?: OrigemProduto
  temNf?: boolean
  unidadeMedida?: UnidadeMedida
  observacao?: string | null
  categoriaId?: string | null
  marcaId?: string | null
  fornecedorId?: string | null
  ncm?: string | null
  cfopProduto?: string | null
  csosn?: string | null
  cest?: string | null
  cstPis?: string | null
  cstCofins?: string | null
  /**
   * Opcional — dual-write `status_publicacao` + `ativo`.
   * Omitido no update: não altera lifecycle.
   */
  statusPublicacao?: StatusPublicacao
  /** Legado create/CSV — preferir `statusPublicacao` quando explícito. */
  ativo?: boolean
}

/**
 * Payload de criação — adapter ProductWriter chama RPC
 * `criar_produto_com_estoque_inicial` (mig. 270); não reimplementar TX em TS.
 */
export type CreateProductInput = ProductCatalogWriteFields & {
  /** Estoque inicial opcional — efeito inventory via RPC 270. */
  estoqueInicial?: number | null
  /** Estoque mínimo inicial opcional — mesma TX (RPC 270). */
  estoqueInicialMinimo?: number | null
  /** Idempotência do create atômico. */
  clientRequestId?: string | null
}

/**
 * Payload de atualização de catálogo — sem estoque (ADR-007 / entity-ssot).
 * Adapter: `productUpdater.ts` → UPDATE em `produtos` apenas.
 */
export type UpdateProductInput = ProductCatalogWriteFields

/**
 * Linha de listagem filtrada do catálogo (UI `/admin/catalogo`).
 * Campos `quantidadeAtual` / `estoqueMinimo` são **snapshot read-through**
 * de inventory — Products não é dono do saldo (ADR-007).
 */
export type ProductListFilteredRow = {
  id: ProductId
  nome: string
  codigoBarras: string | null
  codigoInterno: string | null
  referenciaFornecedor: string | null
  nomeReduzidoPdv: string | null
  localizacaoPrateleira: string | null
  precoVarejo: number
  precoAtacado: number | null
  precoCusto: number | null
  precoCustoMedio: number
  estoqueMinimo: number | null
  permitirAbaixoCusto: boolean
  quantidadeGatilhoAtacado: number | null
  /** Snapshot inventory — read-through. */
  quantidadeAtual: number | null
  origem: string
  temNf: boolean
  ativo: boolean
  statusPublicacao: StatusPublicacao
  imagemUrl: string | null
  categoriaId: string | null
  marcaId: string | null
  fornecedorId: string | null
  unidadeMedida: string
  observacao: string | null
  tags: string[] | null
  ncm: string | null
  cfopProduto: string | null
  csosn: string | null
  cest: string | null
  cstPis: string | null
  cstCofins: string | null
}
