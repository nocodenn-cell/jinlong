import type { FactEnvelope } from '../contracts/fact'
import type { CatalogKpiId } from './registry'
import {
  readArOpenAmount,
  readMargin,
  readSaleAmounts,
  readStockCapital,
} from './payloads'

/**
 * Fórmulas Cycle 2 — só quando payloads forem suficientes.
 * Retorna null → UNAVAILABLE (não inventar).
 */

export function computeKpiValue(
  kpiId: CatalogKpiId,
  facts: readonly FactEnvelope[],
): number | null {
  switch (kpiId) {
    case 'GrossRevenue':
      return sumSales(facts, 'gross')
    case 'NetRevenue':
      return sumSales(facts, 'net')
    case 'AverageTicket':
      return averageTicket(facts)
    case 'GrossProfit':
      return grossProfit(facts)
    case 'GrossMargin':
      return grossMarginRatio(facts)
    case 'InventoryCapital':
      return inventoryCapital(facts)
    case 'ArAging':
      return sumOpen(facts, 'ArTitleFact')
    case 'ApAging':
      return sumOpen(facts, 'ApTitleFact')
    case 'CashFlowForecast':
      return cashFlowNet(facts)
    case 'Liquidity':
      return liquidityRatio(facts)
    case 'CashCoverage':
      return cashCoverageDays(facts)
    case 'NetProfit':
      return netProfit(facts)
    case 'InventoryTurnover':
      return inventoryTurnover(facts)
    case 'CustomerLtv':
    case 'PurchaseFrequency':
    case 'CustomerChurn':
      return null
    default: {
      const _x: never = kpiId
      return _x
    }
  }
}

function sumSales(facts: readonly FactEnvelope[], kind: 'gross' | 'net'): number | null {
  const sales = facts.filter((f) => f.factId === 'SaleFact')
  if (sales.length === 0) return null
  let total = 0
  for (const f of sales) {
    const p = readSaleAmounts(f)
    if (!p) return null
    total += kind === 'gross' ? p.grossAmount : p.netAmount
  }
  return total
}

function averageTicket(facts: readonly FactEnvelope[]): number | null {
  const sales = facts.filter((f) => f.factId === 'SaleFact')
  if (sales.length === 0) return null
  const net = sumSales(facts, 'net')
  if (net === null) return null
  return Math.round((net / sales.length) * 100) / 100
}

function grossProfit(facts: readonly FactEnvelope[]): number | null {
  const margins = facts.filter((f) => f.factId === 'MarginFact')
  if (margins.length === 0) return null
  let total = 0
  for (const f of margins) {
    const p = readMargin(f)
    if (!p) return null
    total += p.netRevenue - p.estimatedCost
  }
  return total
}

function grossMarginRatio(facts: readonly FactEnvelope[]): number | null {
  const margins = facts.filter((f) => f.factId === 'MarginFact')
  if (margins.length === 0) return null
  let revenue = 0
  let cost = 0
  for (const f of margins) {
    const p = readMargin(f)
    if (!p) return null
    if (p.costReliable === false) return null
    revenue += p.netRevenue
    cost += p.estimatedCost
  }
  if (revenue === 0) return null
  return Math.round(((revenue - cost) / revenue) * 10000) / 10000
}

function inventoryCapital(facts: readonly FactEnvelope[]): number | null {
  const stocks = facts.filter((f) => f.factId === 'StockCapitalFact')
  if (stocks.length === 0) return null
  let total = 0
  for (const f of stocks) {
    const p = readStockCapital(f)
    if (!p) return null
    total += p.quantityOnHand * p.unitCost
  }
  return total
}

function sumOpen(facts: readonly FactEnvelope[], factId: string): number | null {
  const rows = facts.filter((f) => f.factId === factId)
  if (rows.length === 0) return null
  let total = 0
  for (const f of rows) {
    const v = readArOpenAmount(f)
    if (v === null) return null
    total += v
  }
  return total
}

function cashFlowNet(facts: readonly FactEnvelope[]): number | null {
  const ar = sumOpen(facts, 'ArTitleFact')
  const ap = sumOpen(facts, 'ApTitleFact')
  if (ar === null || ap === null) return null
  return ar - ap
}

function liquidityRatio(facts: readonly FactEnvelope[]): number | null {
  const ar = sumOpen(facts, 'ArTitleFact')
  const ap = sumOpen(facts, 'ApTitleFact')
  if (ar === null || ap === null || ap === 0) return null
  return Math.round((ar / ap) * 10000) / 10000
}

function cashCoverageDays(facts: readonly FactEnvelope[]): number | null {
  const net = cashFlowNet(facts)
  const ap = sumOpen(facts, 'ApTitleFact')
  if (net === null || ap === null || ap <= 0) return null
  const dailyOut = ap / 30
  if (dailyOut <= 0) return null
  return Math.round((Math.max(net, 0) / dailyOut) * 100) / 100
}

function netProfit(facts: readonly FactEnvelope[]): number | null {
  const gp = grossProfit(facts)
  const ap = sumOpen(facts, 'ApTitleFact')
  if (gp === null || ap === null) return null
  return gp - ap
}

function sumEstimatedCost(facts: readonly FactEnvelope[]): number | null {
  const margins = facts.filter((f) => f.factId === 'MarginFact')
  if (margins.length === 0) return null
  let cost = 0
  for (const f of margins) {
    const p = readMargin(f)
    if (!p) return null
    cost += p.estimatedCost
  }
  return cost
}

function inventoryTurnover(facts: readonly FactEnvelope[]): number | null {
  const cogs = sumEstimatedCost(facts)
  const capital = inventoryCapital(facts)
  if (cogs === null || capital === null || capital === 0) return null
  return Math.round((cogs / capital) * 10000) / 10000
}
