/**
 * FactIds canônicos — espelho de DECISION_FACT_CATALOG.md.
 * Cycle 0: apenas identidade semântica. Sem providers.
 */

export const FACT_IDS = [
  'SaleFact',
  'SaleLineFact',
  'SalePaymentFact',
  'SaleDiscountFact',
  'SaleReturnFact',
  'SaleEventFact',
  'SaleCustomerLinkFact',
  'MarginFact',
  'ArTitleFact',
  'ArLiquidationFact',
  'ApTitleFact',
  'ApPaymentFact',
  'FinancialCategoryFact',
  'StockPositionFact',
  'InventoryMovementFact',
  'StockCapitalFact',
  'CashSessionFact',
  'CashExpectedFact',
  'CashMovementFact',
  'CustomerFact',
  'CustomerCreditSnapshotFact',
  'CustomerPurchaseFact',
  'SupplierFact',
  'SupplierProductLinkFact',
  'SupplierPurchaseFact',
  'ProductFact',
  'ProductPriceFact',
  'ProductCostFact',
  'AuditSignalFact',
  'OperationalTimelineFact',
] as const

export type FactId = (typeof FACT_IDS)[number]

export type FactReadiness = 'READY' | 'PARTIAL' | 'BLOCKED' | 'CONTEXT'

export type FactOwnerDomain =
  | 'sales'
  | 'financial'
  | 'inventory'
  | 'cash'
  | 'customers'
  | 'suppliers'
  | 'products'
  | 'audit'
  | 'composite'
