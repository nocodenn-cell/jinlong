/**
 * Lifecycle catálogo R1 — legacy wrapper
 * All product domain logic consolidated in shared-core/src/domain/product/engine
 * This file maintained for backwards compatibility of existing imports.
 */

export {
  ativoFromStatusPublicacao,
  statusFromAtivoLegacy,
  defaultStatusNovoProduto,
  dualWriteFromStatus,
  resolveStatusPublicacaoLeitura,
  isVendavelPdv,
  podePublicarProduto,
  type StatusPublicacao,
} from '@shared-core/src/domain/product/engine'
