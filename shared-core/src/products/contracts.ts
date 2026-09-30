/**
 * Contratos públicos do domínio products (ports).
 * Implementações de I/O ficam no adapter da app.
 *
 * ADR-007: preço efetivo = Postgres; ProductPriceReader só consulta (sem cálculo).
 * Create = RPC `criar_produto_com_estoque_inicial` via ProductWriter.
 * Exclusion = policy pura + effects na borda.
 * Lifecycle = dual-write status_publicacao + ativo (catálogo).
 */

import type { PriceResolutionResult } from '../pricing/resolution'
import type { ProductErrorCode, ProductErrorParams } from './errorCodes'
import type {
  CreateProductInput,
  ProductCatalogBasics,
  ProductId,
  ProductIdentity,
  ProductListFilteredRow,
  StatusPublicacao,
  UpdateProductInput,
} from './types'

// ─── Leitura de catálogo ───────────────────────────────────────────────────

export type ProductByIdResult =
  | { ok: true; product: ProductCatalogBasics }
  | {
      ok: false
      error: string
      code?: ProductErrorCode
      notFound?: boolean
    }

export type ProductIdentityResult =
  | { ok: true; identity: ProductIdentity }
  | {
      ok: false
      error: string
      code?: ProductErrorCode
      notFound?: boolean
    }

/** Listagem paginada só de catálogo — sem join de estoque (ADR-007). */
export type ListProductsQuery = {
  lojaId: string
  page: number
  termo?: string
  /** Default no adapter (ex.: 20). */
  pageSize?: number
}

export type ListProductsResult =
  | { ok: true; products: ProductCatalogBasics[]; hasMore: boolean }
  | { ok: false; error: string; code?: ProductErrorCode }

/** Filtros da listagem oficial do catálogo (RPC `list_produtos_gerente_filtrados`). */
export type ListProductsFilteredQuery = {
  lojaId: string
  situacao: 'todos' | 'ativos' | 'inativos'
  origem: 'all' | 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
  nf: 'all' | 'sim' | 'nao'
  estoque: 'todos' | 'abaixo_minimo' | 'em_falta'
  imagens: 'todos' | 'com_imagem' | 'sem_imagem'
  tags: string[]
  categoriaId?: string
  marcaId?: string
  fornecedorId?: string
  busca: string
  page: number
  pageSize: number
}

export type ListProductsFilteredResult =
  | { ok: true; rows: ProductListFilteredRow[]; total: number }
  | { ok: false; error: string; code?: ProductErrorCode }

/**
 * Port de leitura do catálogo.
 * Adapter de referência: ver ADR-007 (docs/adr/ADR-007-products-domain-boundary.md).
 * `listComFiltros` pode enriquecer com snapshot de estoque (read-through inventory).
 */
export type ProductReader = {
  getById(id: ProductId): Promise<ProductByIdResult>
  /** Identidade mínima (ex.: lookup PDV) — sem preços de cadastro obrigatórios. */
  getIdentityById(id: ProductId): Promise<ProductIdentityResult>
  listPaginados(query: ListProductsQuery): Promise<ListProductsResult>
  /** Listagem filtrada da UI catálogo — preserva filtros/paginação/RPC existente. */
  listComFiltros(query: ListProductsFilteredQuery): Promise<ListProductsFilteredResult>
}

// ─── Preço efetivo (consulta) ──────────────────────────────────────────────

/** Entrada da consulta de preço efetivo — espelha args da RPC. */
export type ResolveProductPriceQuery = {
  produtoId: ProductId
  /** Quantidade do carrinho (RPC usa integer via floor na borda). */
  quantidade: number
  lojaId: string
}

export type ResolveProductPriceOk = {
  ok: true
  /** Resultado já resolvido pela autoridade (RPC / espelho offline). */
  price: PriceResolutionResult
}

export type ResolveProductPriceErr = {
  ok: false
  error: string
  code?: ProductErrorCode
}

export type ResolveProductPriceResult = ResolveProductPriceOk | ResolveProductPriceErr

/**
 * Port de **consulta** do preço efetivo.
 *
 * - Web: `productPriceReader.ts` → RPC `calcular_preco_produto` (Postgres).
 * - Offline: espelho `pricing/calcularPrecoCanonico` (paridade ADR-007).
 * - Proibido: reimplementar a cadeia em policies/actions de products.
 */
export type ProductPriceReader = {
  resolveEffectivePrice(
    query: ResolveProductPriceQuery,
  ): Promise<ResolveProductPriceResult>
}

// ─── Escrita (create) ──────────────────────────────────────────────────────

export type CreateProductCommand = {
  input: CreateProductInput
  lojaId: string
  /** Ator da sessão — RPC 270 usa `p_ator_id`. */
  atorId: string
}

export type CreateProductResult =
  | { ok: true; product: ProductCatalogBasics }
  | {
      ok: false
      error: string
      code?: ProductErrorCode
      params?: ProductErrorParams
    }

/**
 * Port de criação → RPC `criar_produto_com_estoque_inicial` (mig. 270).
 * Única porta de create do catálogo (form, CSV, lote, PDV relâmpago).
 */
export type ProductWriter = {
  create(command: CreateProductCommand): Promise<CreateProductResult>
}

// ─── Atualização de catálogo ───────────────────────────────────────────────

export type UpdateProductCommand = {
  id: ProductId
  input: UpdateProductInput
  /** Escopo multi-loja — UPDATE filtra `loja_id`. */
  lojaId: string
}

export type UpdateProductResult =
  | { ok: true; product: ProductCatalogBasics }
  | {
      ok: false
      error: string
      code?: ProductErrorCode
      params?: ProductErrorParams
      notFound?: boolean
    }

export type UpdateCategoriaLoteCommand = {
  ids: ProductId[]
  lojaId: string
  categoriaId: string | null
}

export type UpdateCategoriaLoteResult =
  | { ok: true; atualizados: number }
  | { ok: false; error: string; code?: ProductErrorCode }

/**
 * Port de atualização de catálogo.
 * → UPDATE `produtos` (sem estoque / sem RPC 270 / sem preço efetivo).
 */
export type ProductUpdater = {
  update(command: UpdateProductCommand): Promise<UpdateProductResult>
  updateCategoriaLote(
    command: UpdateCategoriaLoteCommand,
  ): Promise<UpdateCategoriaLoteResult>
}

// ─── Lifecycle de publicação (catálogo) ────────────────────────────────────

export type SetProductStatusCommand = {
  id: ProductId
  lojaId: string
  status: StatusPublicacao
}

export type SetProductStatusLoteCommand = {
  ids: ProductId[]
  lojaId: string
  status: StatusPublicacao
}

export type SetProductStatusResult =
  | { ok: true }
  | {
      ok: false
      error: string
      code?: ProductErrorCode
      notFound?: boolean
    }

export type SetProductStatusLoteResult =
  | { ok: true; atualizados: number }
  | { ok: false; error: string; code?: ProductErrorCode }

/**
 * Dual-write `status_publicacao` + `ativo` — dono: Products (catálogo).
 * Adapter: `productLifecycle.ts`.
 */
export type ProductLifecycleService = {
  setStatus(command: SetProductStatusCommand): Promise<SetProductStatusResult>
  setStatusLote(
    command: SetProductStatusLoteCommand,
  ): Promise<SetProductStatusLoteResult>
}

// ─── Exclusão / inativação ─────────────────────────────────────────────────

/**
 * Fatos obtidos pelo adapter para decidir exclusão (sem I/O na policy).
 */
export type ProductExclusionFacts = {
  ativo: boolean
  temItensVenda: boolean
  temRemessaItens: boolean
  temMovimentosEstoque: boolean
  temReposicoesCancelamento: boolean
  /**
   * Saldo atual em `estoque` — investigado; **não** bloqueia delete
   * (regra legada remove a linha órfã no delete físico limpo).
   */
  temSaldoEstoque: boolean
}

export type ProductExclusionDecision =
  | {
      action: 'reject'
      code: ProductErrorCode
      error: string
      params?: ProductErrorParams
    }
  | { action: 'inactivate'; alreadyInactive: boolean }
  | { action: 'delete' }

export type ExcludeProductResult =
  | {
      ok: true
      outcome: 'deleted' | 'inactivated' | 'already_inactive'
    }
  | {
      ok: false
      error: string
      code?: ProductErrorCode
      params?: ProductErrorParams
      notFound?: boolean
    }

export type ProductExclusionEffects = {
  loadExclusionFacts(
    id: ProductId,
  ): Promise<
    | { ok: true; facts: ProductExclusionFacts }
    | { ok: false; error: string; code?: ProductErrorCode; notFound?: boolean }
  >
  inactivate(id: ProductId): Promise<{ ok: true } | { ok: false; error: string; code?: ProductErrorCode }>
  deletePhysical(
    id: ProductId,
  ): Promise<{ ok: true } | { ok: false; error: string; code?: ProductErrorCode }>
}

export type ProductExclusionService = {
  exclude(id: ProductId): Promise<ExcludeProductResult>
}
