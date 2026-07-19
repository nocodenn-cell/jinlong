export {
  propagateOperationalConfidence,
  operationalToConfidenceLevel,
  inferSupportLevelFromFacts,
  resolveDerivedStatus,
} from './confidence'

export {
  KPI_IDS,
  KPI_REGISTRY,
  getKpiDefinition,
  listKpiDefinitions,
} from './registry'
export type { CatalogKpiId } from './registry'

export { computeKpiValue } from './formulas'
export {
  readArOpenAmount,
  readMargin,
  readSaleAmounts,
  readStockCapital,
} from './payloads'
export type {
  ArAgingPayload,
  MarginPayload,
  SaleAmountsPayload,
  StockCapitalPayload,
} from './payloads'
