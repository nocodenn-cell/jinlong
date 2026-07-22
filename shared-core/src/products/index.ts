/**
 * Domínio products (catálogo) — barrel público.
 * Missão Products 2–10 / ADR-007.
 *
 * Apps importam daqui. Preço efetivo: ProductPriceReader (Postgres).
 */

export type {
  CreateProductInput,
  OrigemProduto,
  ProductCatalogBasics,
  ProductCatalogWriteFields,
  ProductId,
  ProductIdentity,
  ProductListFilteredRow,
  StatusPublicacao,
  UnidadeMedida,
  UpdateProductInput,
} from './types'

export type { ProductErrorCode, ProductErrorParams } from './errorCodes'
export { PRODUCT_ERROR_CODES } from './errorCodes'

export type {
  CreateProductCommand,
  CreateProductResult,
  ExcludeProductResult,
  ListProductsFilteredQuery,
  ListProductsFilteredResult,
  ListProductsQuery,
  ListProductsResult,
  ProductByIdResult,
  ProductExclusionDecision,
  ProductExclusionEffects,
  ProductExclusionFacts,
  ProductExclusionService,
  ProductIdentityResult,
  ProductLifecycleService,
  ProductPriceReader,
  ProductReader,
  ProductUpdater,
  ProductWriter,
  ResolveProductPriceErr,
  ResolveProductPriceOk,
  ResolveProductPriceQuery,
  ResolveProductPriceResult,
  SetProductStatusCommand,
  SetProductStatusLoteCommand,
  SetProductStatusLoteResult,
  SetProductStatusResult,
  UpdateCategoriaLoteCommand,
  UpdateCategoriaLoteResult,
  UpdateProductCommand,
  UpdateProductResult,
} from './contracts'

export {
  decideProductExclusion,
  produtoTemReferenciaOperacional,
} from './policies/exclusionPolicy'

export type { ValidateProductResult } from './policies/validateProductInput'
export {
  validateCreateProductCommand,
  validateUpdateProductCommand,
} from './policies/validateProductInput'
