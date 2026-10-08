import type { SiteLocale } from './locales'

/**
 * Simulação ILUSTRATIVA de atacado, em memória, com dados fictícios.
 * No Jinlong as faixas de quantidade e os preços são definidos produto a produto;
 * o limite de 10 unidades abaixo é só deste exemplo, não uma regra do sistema.
 */
export interface WholesaleExample {
  retailCents: number
  wholesaleCents: number
  minQty: number
  maxQty: number
  initialQty: number
  /** Escala da barra de progresso (unidades). */
  barScale: number
}

export const WHOLESALE_EXAMPLE: WholesaleExample = {
  retailCents: 2290,
  wholesaleCents: 1850,
  minQty: 10,
  maxQty: 99,
  initialQty: 6,
  barScale: 22,
}

export function clampQty(qty: number, example: WholesaleExample = WHOLESALE_EXAMPLE): number {
  if (!Number.isFinite(qty)) return 1
  return Math.min(example.maxQty, Math.max(1, Math.trunc(qty)))
}

export function isWholesale(qty: number, example: WholesaleExample = WHOLESALE_EXAMPLE): boolean {
  return qty >= example.minQty
}

export function unitCents(qty: number, example: WholesaleExample = WHOLESALE_EXAMPLE): number {
  return isWholesale(qty, example) ? example.wholesaleCents : example.retailCents
}

export function totalCents(qty: number, example: WholesaleExample = WHOLESALE_EXAMPLE): number {
  return unitCents(qty, example) * qty
}

export function savingsCents(qty: number, example: WholesaleExample = WHOLESALE_EXAMPLE): number {
  return isWholesale(qty, example) ? qty * (example.retailCents - example.wholesaleCents) : 0
}

export function missingUnits(qty: number, example: WholesaleExample = WHOLESALE_EXAMPLE): number {
  return Math.max(0, example.minQty - qty)
}

export function progressPercent(qty: number, example: WholesaleExample = WHOLESALE_EXAMPLE): number {
  return Math.min(100, (qty / example.barScale) * 100)
}

export function markPercent(example: WholesaleExample = WHOLESALE_EXAMPLE): number {
  return (example.minQty / example.barScale) * 100
}

export function formatBrl(cents: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function formatDecimal(cents: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
}

export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
