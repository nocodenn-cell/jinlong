import type { KpiDerivationDefinition } from '../contracts/derived-kpi'
import type { KpiId } from '../contracts/kpi'

/**
 * KPI Registry — ids alinhados ao catálogo FI / missão Cycle 2.
 * Fórmulas executáveis só quando Facts + payloads bastarem.
 */

export const KPI_IDS = [
  'GrossRevenue',
  'NetRevenue',
  'GrossMargin',
  'GrossProfit',
  'NetProfit',
  'InventoryCapital',
  'InventoryTurnover',
  'AverageTicket',
  'CustomerLtv',
  'PurchaseFrequency',
  'CustomerChurn',
  'ArAging',
  'ApAging',
  'CashFlowForecast',
  'Liquidity',
  'CashCoverage',
] as const

export type CatalogKpiId = (typeof KPI_IDS)[number]

const defs: Record<CatalogKpiId, KpiDerivationDefinition> = {
  GrossRevenue: {
    id: 'GrossRevenue',
    nameCode: 'intel.kpi.gross_revenue.name',
    descriptionCode: 'intel.kpi.gross_revenue.desc',
    owner: 'sales',
    requiredFacts: ['SaleFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  NetRevenue: {
    id: 'NetRevenue',
    nameCode: 'intel.kpi.net_revenue.name',
    descriptionCode: 'intel.kpi.net_revenue.desc',
    owner: 'sales',
    requiredFacts: ['SaleFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  GrossMargin: {
    id: 'GrossMargin',
    nameCode: 'intel.kpi.gross_margin.name',
    descriptionCode: 'intel.kpi.gross_margin.desc',
    owner: 'financial',
    requiredFacts: ['MarginFact'],
    formulaVersion: '1.0.0',
    unit: 'ratio',
  },
  GrossProfit: {
    id: 'GrossProfit',
    nameCode: 'intel.kpi.gross_profit.name',
    descriptionCode: 'intel.kpi.gross_profit.desc',
    owner: 'financial',
    requiredFacts: ['MarginFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  NetProfit: {
    id: 'NetProfit',
    nameCode: 'intel.kpi.net_profit.name',
    descriptionCode: 'intel.kpi.net_profit.desc',
    owner: 'financial',
    requiredFacts: ['MarginFact', 'ApTitleFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  InventoryCapital: {
    id: 'InventoryCapital',
    nameCode: 'intel.kpi.inventory_capital.name',
    descriptionCode: 'intel.kpi.inventory_capital.desc',
    owner: 'inventory',
    requiredFacts: ['StockCapitalFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  InventoryTurnover: {
    id: 'InventoryTurnover',
    nameCode: 'intel.kpi.inventory_turnover.name',
    descriptionCode: 'intel.kpi.inventory_turnover.desc',
    owner: 'inventory',
    requiredFacts: ['MarginFact', 'StockCapitalFact'],
    formulaVersion: '1.0.0',
    unit: 'ratio',
  },
  AverageTicket: {
    id: 'AverageTicket',
    nameCode: 'intel.kpi.average_ticket.name',
    descriptionCode: 'intel.kpi.average_ticket.desc',
    owner: 'sales',
    requiredFacts: ['SaleFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  CustomerLtv: {
    id: 'CustomerLtv',
    nameCode: 'intel.kpi.customer_ltv.name',
    descriptionCode: 'intel.kpi.customer_ltv.desc',
    owner: 'customer',
    requiredFacts: ['CustomerPurchaseFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  PurchaseFrequency: {
    id: 'PurchaseFrequency',
    nameCode: 'intel.kpi.purchase_frequency.name',
    descriptionCode: 'intel.kpi.purchase_frequency.desc',
    owner: 'customer',
    requiredFacts: ['CustomerPurchaseFact'],
    formulaVersion: '1.0.0',
    unit: 'ratio',
  },
  CustomerChurn: {
    id: 'CustomerChurn',
    nameCode: 'intel.kpi.customer_churn.name',
    descriptionCode: 'intel.kpi.customer_churn.desc',
    owner: 'customer',
    requiredFacts: ['CustomerPurchaseFact'],
    formulaVersion: '1.0.0',
    unit: 'ratio',
  },
  ArAging: {
    id: 'ArAging',
    nameCode: 'intel.kpi.ar_aging.name',
    descriptionCode: 'intel.kpi.ar_aging.desc',
    owner: 'financial',
    requiredFacts: ['ArTitleFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  ApAging: {
    id: 'ApAging',
    nameCode: 'intel.kpi.ap_aging.name',
    descriptionCode: 'intel.kpi.ap_aging.desc',
    owner: 'financial',
    requiredFacts: ['ApTitleFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  CashFlowForecast: {
    id: 'CashFlowForecast',
    nameCode: 'intel.kpi.cash_flow_forecast.name',
    descriptionCode: 'intel.kpi.cash_flow_forecast.desc',
    owner: 'financial',
    requiredFacts: ['ArTitleFact', 'ApTitleFact'],
    formulaVersion: '1.0.0',
    unit: 'money',
    currency: 'BRL',
  },
  Liquidity: {
    id: 'Liquidity',
    nameCode: 'intel.kpi.liquidity.name',
    descriptionCode: 'intel.kpi.liquidity.desc',
    owner: 'financial',
    requiredFacts: ['ArTitleFact', 'ApTitleFact'],
    formulaVersion: '1.0.0',
    unit: 'ratio',
  },
  CashCoverage: {
    id: 'CashCoverage',
    nameCode: 'intel.kpi.cash_coverage.name',
    descriptionCode: 'intel.kpi.cash_coverage.desc',
    owner: 'financial',
    requiredFacts: ['ArTitleFact', 'ApTitleFact'],
    formulaVersion: '1.0.0',
    unit: 'days',
  },
}

export const KPI_REGISTRY: Readonly<Record<CatalogKpiId, KpiDerivationDefinition>> = defs

export function listKpiDefinitions(): readonly KpiDerivationDefinition[] {
  return KPI_IDS.map((id) => KPI_REGISTRY[id])
}

export function getKpiDefinition(id: KpiId): KpiDerivationDefinition | undefined {
  return (KPI_REGISTRY as Record<string, KpiDerivationDefinition>)[id]
}
