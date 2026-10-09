import type { SiteLocale } from './locales'

/**
 * Catálogo FICTÍCIO usado nas representações de tela. Nomes em chinês são rascunho
 * (revisão nativa pendente); valores em centavos.
 */
export interface DemoProduct {
  id: string
  pt: string
  zh: string
  retailCents: number
  wholesaleCents: number | null
  /** Quantidade da faixa de atacado deste exemplo (ilustrativa). */
  wholesaleMin: number | null
  stock: number
}

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { id: 'kit', pt: 'Kit pote hermético 3 pç', zh: '密封保鲜盒套装（3件）', retailCents: 2290, wholesaleCents: 1850, wholesaleMin: 10, stock: 146 },
  { id: 'garrafa', pt: 'Garrafa térmica 500 ml', zh: '保温水壶 500 毫升', retailCents: 2990, wholesaleCents: 2590, wholesaleMin: 12, stock: 88 },
  { id: 'carregador', pt: 'Carregador USB-C 20 W', zh: 'USB-C 20W 充电器', retailCents: 3990, wholesaleCents: null, wholesaleMin: null, stock: 6 },
  { id: 'organizador', pt: 'Organizador de gavetas', zh: '抽屉收纳盒', retailCents: 1490, wholesaleCents: 1190, wholesaleMin: 20, stock: 230 },
  { id: 'luminaria', pt: 'Luminária de mesa LED', zh: 'LED 台灯', retailCents: 5490, wholesaleCents: null, wholesaleMin: null, stock: 41 },
  { id: 'copos', pt: 'Jogo de copos 6 pç', zh: '玻璃杯套装（6件）', retailCents: 3490, wholesaleCents: 2990, wholesaleMin: 6, stock: 63 },
]

export const CRITICAL_STOCK_LIMIT = 10

export function productName(product: DemoProduct, locale: SiteLocale): string {
  return locale === 'zh-CN' ? product.zh : product.pt
}

export function findProduct(id: string): DemoProduct {
  const product = DEMO_PRODUCTS.find((item) => item.id === id)
  if (!product) throw new Error(`Produto fictício desconhecido: ${id}`)
  return product
}

export interface SaleLine {
  productId: string
  qty: number
  wholesale: boolean
}

/** Venda de exemplo do hero: 2 + 12 + 1 itens = R$ 321,70 (conferido no teste). */
export const HERO_SALE: readonly SaleLine[] = [
  { productId: 'garrafa', qty: 2, wholesale: false },
  { productId: 'kit', qty: 12, wholesale: true },
  { productId: 'carregador', qty: 1, wholesale: false },
]

export function lineSubtotalCents(line: SaleLine): number {
  const product = findProduct(line.productId)
  const unit = line.wholesale && product.wholesaleCents !== null ? product.wholesaleCents : product.retailCents
  return unit * line.qty
}

export function saleTotalCents(lines: readonly SaleLine[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotalCents(line), 0)
}

export function saleItemCount(lines: readonly SaleLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0)
}

/** Fechamento de caixa fictício (R$ por forma de pagamento). */
export const CLOSING_FIGURES = {
  openingCents: 20000,
  cashCents: 118430,
  pixCents: 84210,
  debitCents: 79040,
  creditCents: 101620,
} as const

export function closingTotalCents(): number {
  const { cashCents, pixCents, debitCents, creditCents } = CLOSING_FIGURES
  return cashCents + pixCents + debitCents + creditCents
}

export const PANEL_KPIS = { itemsSold: 212, criticalItems: 3 } as const
export const PANEL_BARS: readonly number[] = [40, 62, 48, 75, 58, 88, 70]
