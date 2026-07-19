import type { FactRegistryEntry } from '../contracts/fact'
import type { FactId } from './definitions'
import { FACT_IDS } from './definitions'

/**
 * Fact Registry tipado — DECISION_FACT_CATALOG.
 * Cycle 0: metadados apenas. Sem providers, sem SQL.
 */

const ENTRIES: Record<FactId, FactRegistryEntry> = {
  SaleFact: {
    factId: 'SaleFact',
    owner: 'sales',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.sale',
  },
  SaleLineFact: {
    factId: 'SaleLineFact',
    owner: 'sales',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.sale_line',
  },
  SalePaymentFact: {
    factId: 'SalePaymentFact',
    owner: 'sales',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.sale_payment',
  },
  SaleDiscountFact: {
    factId: 'SaleDiscountFact',
    owner: 'sales',
    readiness: 'PARTIAL',
    gateIds: [],
    descriptionCode: 'intel.fact.sale_discount',
  },
  SaleReturnFact: {
    factId: 'SaleReturnFact',
    owner: 'sales',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.sale_return',
  },
  SaleEventFact: {
    factId: 'SaleEventFact',
    owner: 'sales',
    readiness: 'READY',
    gateIds: ['GATE_DATABASE_TYPES_STALE'],
    descriptionCode: 'intel.fact.sale_event',
  },
  SaleCustomerLinkFact: {
    factId: 'SaleCustomerLinkFact',
    owner: 'sales',
    readiness: 'PARTIAL',
    gateIds: ['GATE_CUSTOMER_SALE_LINK', 'GATE_DATABASE_TYPES_STALE'],
    descriptionCode: 'intel.fact.sale_customer_link',
  },
  MarginFact: {
    factId: 'MarginFact',
    owner: 'sales',
    readiness: 'PARTIAL',
    gateIds: ['GATE_MARGIN_COST_RELIABLE'],
    descriptionCode: 'intel.fact.margin',
  },
  ArTitleFact: {
    factId: 'ArTitleFact',
    owner: 'financial',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.ar_title',
  },
  ArLiquidationFact: {
    factId: 'ArLiquidationFact',
    owner: 'financial',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.ar_liquidation',
  },
  ApTitleFact: {
    factId: 'ApTitleFact',
    owner: 'financial',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.ap_title',
  },
  ApPaymentFact: {
    factId: 'ApPaymentFact',
    owner: 'financial',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.ap_payment',
  },
  FinancialCategoryFact: {
    factId: 'FinancialCategoryFact',
    owner: 'financial',
    readiness: 'PARTIAL',
    gateIds: [],
    descriptionCode: 'intel.fact.financial_category',
  },
  StockPositionFact: {
    factId: 'StockPositionFact',
    owner: 'inventory',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.stock_position',
  },
  InventoryMovementFact: {
    factId: 'InventoryMovementFact',
    owner: 'inventory',
    readiness: 'READY',
    gateIds: ['GATE_DATABASE_TYPES_STALE'],
    descriptionCode: 'intel.fact.inventory_movement',
  },
  StockCapitalFact: {
    factId: 'StockCapitalFact',
    owner: 'composite',
    readiness: 'PARTIAL',
    gateIds: ['GATE_STOCK_CAPITAL_KARDEX_COST'],
    descriptionCode: 'intel.fact.stock_capital',
  },
  CashSessionFact: {
    factId: 'CashSessionFact',
    owner: 'cash',
    readiness: 'CONTEXT',
    gateIds: [],
    descriptionCode: 'intel.fact.cash_session',
  },
  CashExpectedFact: {
    factId: 'CashExpectedFact',
    owner: 'cash',
    readiness: 'CONTEXT',
    gateIds: [],
    descriptionCode: 'intel.fact.cash_expected',
  },
  CashMovementFact: {
    factId: 'CashMovementFact',
    owner: 'cash',
    readiness: 'CONTEXT',
    gateIds: [],
    descriptionCode: 'intel.fact.cash_movement',
  },
  CustomerFact: {
    factId: 'CustomerFact',
    owner: 'customers',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.customer',
  },
  CustomerCreditSnapshotFact: {
    factId: 'CustomerCreditSnapshotFact',
    owner: 'composite',
    readiness: 'PARTIAL',
    gateIds: [],
    descriptionCode: 'intel.fact.customer_credit_snapshot',
  },
  CustomerPurchaseFact: {
    factId: 'CustomerPurchaseFact',
    owner: 'composite',
    readiness: 'BLOCKED',
    gateIds: ['GATE_CUSTOMER_SALE_LINK', 'GATE_DATABASE_TYPES_STALE'],
    descriptionCode: 'intel.fact.customer_purchase',
  },
  SupplierFact: {
    factId: 'SupplierFact',
    owner: 'suppliers',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.supplier',
  },
  SupplierProductLinkFact: {
    factId: 'SupplierProductLinkFact',
    owner: 'suppliers',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.supplier_product_link',
  },
  SupplierPurchaseFact: {
    factId: 'SupplierPurchaseFact',
    owner: 'composite',
    readiness: 'PARTIAL',
    gateIds: [],
    descriptionCode: 'intel.fact.supplier_purchase',
  },
  ProductFact: {
    factId: 'ProductFact',
    owner: 'products',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.product',
  },
  ProductPriceFact: {
    factId: 'ProductPriceFact',
    owner: 'products',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.product_price',
  },
  ProductCostFact: {
    factId: 'ProductCostFact',
    owner: 'products',
    readiness: 'PARTIAL',
    gateIds: [],
    descriptionCode: 'intel.fact.product_cost',
  },
  AuditSignalFact: {
    factId: 'AuditSignalFact',
    owner: 'audit',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.audit_signal',
  },
  OperationalTimelineFact: {
    factId: 'OperationalTimelineFact',
    owner: 'audit',
    readiness: 'READY',
    gateIds: [],
    descriptionCode: 'intel.fact.operational_timeline',
  },
}

export const FACT_REGISTRY: Readonly<Record<FactId, FactRegistryEntry>> = ENTRIES

export function getFactEntry(factId: FactId): FactRegistryEntry {
  return FACT_REGISTRY[factId]
}

export function listFactEntries(): readonly FactRegistryEntry[] {
  return FACT_IDS.map((id) => FACT_REGISTRY[id])
}
