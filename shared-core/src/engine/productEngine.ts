/**
 * DEPRECATED: productEngine.ts is now located in shared-core/src/domain/product/engine.ts
 * This file maintained for backwards compatibility of existing imports.
 *
 * New code should import from: @shared-core/src/domain/product/engine
 */

export {
  PRODUCT_RULES,
  type ProdutoAvaliavel,
  type ProdutoAvaliado,
  evaluateProduct,
  statusInicialProduto,
  ativoFromStatusPublicacao,
  statusFromAtivoLegacy,
  defaultStatusNovoProduto,
  dualWriteFromStatus,
  resolveStatusPublicacaoLeitura,
  isVendavelPdv,
  podePublicarProduto,
  type StatusPublicacao,
  type ProdutoOrigem,
} from '../domain/product/engine'
