import type { FactProviderDescriptor } from '../contracts/provider-support'
import { defaultOperationalConfidence } from '../contracts/provider-support'
import type { FactId } from './definitions'

/**
 * Cycle 1 — plano em duas ondas (DECISION_INTELLIGENCE_CYCLE_1.md).
 * Descriptors apenas — sem I/O / SQL.
 */

/** Onda A: somente SUPPORTED para validar infraestrutura. */
export const WAVE_A_SUPPORTED_FACT_IDS = [
  'SaleFact',
  'SaleLineFact',
  'SalePaymentFact',
  'SaleReturnFact',
  'StockPositionFact',
  'InventoryMovementFact',
  'ProductFact',
  'ProductPriceFact',
  'ArTitleFact',
  'ApTitleFact',
  'CustomerFact',
  'SupplierFact',
] as const satisfies readonly FactId[]

export type WaveASupportedFactId = (typeof WAVE_A_SUPPORTED_FACT_IDS)[number]

/** Onda B: condicionais — declararam qualidade, sem completar dados. */
export const WAVE_B_CONDITIONAL_FACT_IDS = [
  'MarginFact',
  'StockCapitalFact',
  'CustomerPurchaseFact',
  'SaleCustomerLinkFact',
] as const satisfies readonly FactId[]

export type WaveBConditionalFactId = (typeof WAVE_B_CONDITIONAL_FACT_IDS)[number]

/** CONTEXT — loaders opcionais; nunca input de Recommendation na Onda A. */
export const WAVE_CONTEXT_FACT_IDS = [
  'CashSessionFact',
  'CashExpectedFact',
  'CashMovementFact',
] as const satisfies readonly FactId[]

function supportedDescriptor(
  factId: WaveASupportedFactId,
  dependencies: FactProviderDescriptor['dependencies'],
): FactProviderDescriptor {
  return {
    factId,
    supportLevel: 'SUPPORTED',
    operationalConfidence: defaultOperationalConfidence('SUPPORTED'),
    dependencies,
    gateIds: [],
    statusExplanationCode: `intel.provider.${camelToSnake(factId)}.supported`,
    wave: 'A',
  }
}

function camelToSnake(factId: string): string {
  return factId
    .replace(/Fact$/, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

export const WAVE_A_DESCRIPTORS: Record<
  WaveASupportedFactId,
  FactProviderDescriptor
> = {
  SaleFact: supportedDescriptor('SaleFact', ['sales']),
  SaleLineFact: supportedDescriptor('SaleLineFact', ['sales']),
  SalePaymentFact: supportedDescriptor('SalePaymentFact', ['sales']),
  SaleReturnFact: supportedDescriptor('SaleReturnFact', ['sales']),
  StockPositionFact: supportedDescriptor('StockPositionFact', ['inventory']),
  InventoryMovementFact: supportedDescriptor('InventoryMovementFact', ['inventory']),
  ProductFact: supportedDescriptor('ProductFact', ['products']),
  ProductPriceFact: supportedDescriptor('ProductPriceFact', ['products']),
  ArTitleFact: supportedDescriptor('ArTitleFact', ['financial']),
  ApTitleFact: supportedDescriptor('ApTitleFact', ['financial']),
  CustomerFact: supportedDescriptor('CustomerFact', ['customers']),
  SupplierFact: supportedDescriptor('SupplierFact', ['suppliers']),
}

export const WAVE_B_DESCRIPTORS: Record<
  WaveBConditionalFactId,
  FactProviderDescriptor
> = {
  MarginFact: {
    factId: 'MarginFact',
    supportLevel: 'PARTIAL',
    operationalConfidence: defaultOperationalConfidence('PARTIAL'),
    dependencies: ['sales'],
    gateIds: ['GATE_MARGIN_COST_RELIABLE'],
    statusExplanationCode: 'intel.provider.margin.partial',
    wave: 'B',
  },
  StockCapitalFact: {
    factId: 'StockCapitalFact',
    supportLevel: 'PARTIAL',
    operationalConfidence: defaultOperationalConfidence('PARTIAL'),
    dependencies: ['inventory', 'products'],
    gateIds: ['GATE_STOCK_CAPITAL_KARDEX_COST'],
    statusExplanationCode: 'intel.provider.stock_capital.partial',
    wave: 'B',
  },
  CustomerPurchaseFact: {
    factId: 'CustomerPurchaseFact',
    supportLevel: 'UNSUPPORTED',
    operationalConfidence: 0,
    dependencies: ['sales', 'customers'],
    gateIds: ['GATE_CUSTOMER_SALE_LINK'],
    statusExplanationCode: 'intel.provider.customer_purchase.unsupported',
    wave: 'B',
  },
  SaleCustomerLinkFact: {
    factId: 'SaleCustomerLinkFact',
    supportLevel: 'PARTIAL',
    operationalConfidence: 0.4,
    dependencies: ['sales', 'customers'],
    gateIds: ['GATE_CUSTOMER_SALE_LINK'],
    statusExplanationCode: 'intel.provider.sale_customer_link.partial',
    wave: 'B',
  },
}

export function isWaveASupportedFactId(factId: FactId): factId is WaveASupportedFactId {
  return (WAVE_A_SUPPORTED_FACT_IDS as readonly string[]).includes(factId)
}

export function assertWaveAOnly(factIds: readonly FactId[]): void {
  for (const id of factIds) {
    if (!isWaveASupportedFactId(id)) {
      throw new Error(`INTEL_WAVE_A_VIOLATION:${id}`)
    }
  }
}
