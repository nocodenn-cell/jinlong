/**
 * Tipos compartilhados para precificação.
 *
 * FONTE ÚNICA: `shared-core/src/pricing/types`. Este módulo apenas reexporta
 * para os consumidores que importam via `@shared/pricing/types`, evitando duas
 * definições divergentes de RegraPreco/ResultadoPreco/PricingContext.
 */
export type {
  RegraPreco,
  ResultadoPreco,
  PricingContext,
} from '../../shared-core/src/pricing/types'
export { DEFAULT_PRICING_CONTEXT } from '../../shared-core/src/pricing/types'
