import type { FactEnvelope } from '../contracts/fact'

/** Payloads mínimos para derivação Cycle 2 — tipados, sem SQL. */

export type SaleAmountsPayload = {
  grossAmount: number
  netAmount: number
  discountAmount?: number
}

export type StockCapitalPayload = {
  quantityOnHand: number
  unitCost: number
}

export type MarginPayload = {
  netRevenue: number
  estimatedCost: number
  grossMargin?: number
  costReliable?: boolean
}

export type ArAgingPayload = {
  openAmount: number
  bucket?: '0_30' | '31_60' | '61_90' | '90_PLUS'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function readSaleAmounts(fact: FactEnvelope): SaleAmountsPayload | null {
  if (!isRecord(fact.payload)) return null
  const gross = num(fact.payload.grossAmount)
  const net = num(fact.payload.netAmount)
  if (gross === null || net === null) return null
  const discount = num(fact.payload.discountAmount)
  return {
    grossAmount: gross,
    netAmount: net,
    discountAmount: discount ?? undefined,
  }
}

export function readStockCapital(fact: FactEnvelope): StockCapitalPayload | null {
  if (!isRecord(fact.payload)) return null
  const qty = num(fact.payload.quantityOnHand)
  const cost = num(fact.payload.unitCost)
  if (qty === null || cost === null) return null
  return { quantityOnHand: qty, unitCost: cost }
}

export function readMargin(fact: FactEnvelope): MarginPayload | null {
  if (!isRecord(fact.payload)) return null
  const netRevenue = num(fact.payload.netRevenue)
  const estimatedCost = num(fact.payload.estimatedCost)
  if (netRevenue === null || estimatedCost === null) return null
  const grossMargin = num(fact.payload.grossMargin)
  return {
    netRevenue,
    estimatedCost,
    grossMargin: grossMargin ?? undefined,
    costReliable:
      typeof fact.payload.costReliable === 'boolean'
        ? fact.payload.costReliable
        : undefined,
  }
}

export function readArOpenAmount(fact: FactEnvelope): number | null {
  if (!isRecord(fact.payload)) return null
  return num(fact.payload.openAmount)
}
