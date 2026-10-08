import type { SiteLocale } from './locales'

/**
 * Prévia do PDV na home — dados exclusivamente FICTÍCIOS, em memória.
 * Nenhum acesso a banco de dados, rede ou dados de loja.
 * Regra espelhada do produto: atacado vale a partir da quantidade mínima (padrão 6).
 */

export const ATACADO_MIN_QTY = 6

export interface PreviewProduct {
  id: string
  namePt: string
  nameZh: string
  /** Preço unitário em centavos. */
  varejoCents: number
  atacadoCents: number
  initialQty: number
}

export const PREVIEW_PRODUCTS: readonly PreviewProduct[] = [
  { id: 'fone', namePt: 'Fone Bluetooth', nameZh: '蓝牙耳机', varejoCents: 4990, atacadoCents: 3490, initialQty: 2 },
  { id: 'carregador', namePt: 'Carregador USB-C 20W', nameZh: 'USB-C 20W 充电器', varejoCents: 3990, atacadoCents: 2790, initialQty: 5 },
  { id: 'cabo', namePt: 'Cabo HDMI 2 m', nameZh: 'HDMI 数据线 2 米', varejoCents: 2490, atacadoCents: 1690, initialQty: 1 },
]

export function isAtacado(qty: number): boolean {
  return qty >= ATACADO_MIN_QTY
}

export function unitPriceCents(product: PreviewProduct, qty: number): number {
  return isAtacado(qty) ? product.atacadoCents : product.varejoCents
}

export function lineTotalCents(product: PreviewProduct, qty: number): number {
  return unitPriceCents(product, qty) * qty
}

export function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0
  return Math.min(99, Math.max(0, Math.trunc(qty)))
}

export function totalCents(quantities: Readonly<Record<string, number>>): number {
  return PREVIEW_PRODUCTS.reduce(
    (sum, product) => sum + lineTotalCents(product, clampQty(quantities[product.id] ?? 0)),
    0
  )
}

export function formatBrl(cents: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function initialQuantities(): Record<string, number> {
  return Object.fromEntries(PREVIEW_PRODUCTS.map((p) => [p.id, p.initialQty]))
}
