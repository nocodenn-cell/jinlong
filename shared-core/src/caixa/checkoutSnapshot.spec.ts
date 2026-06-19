import { describe, expect, it } from 'vitest'
import type { ItemCarrinho } from '../stores/unifiedCartStore'
import {
  buildCheckoutSnapshot,
  validateCheckoutSnapshot,
  type DeclaredTotals,
} from './checkoutSnapshot'

function item(over: Partial<ItemCarrinho> = {}): ItemCarrinho {
  return {
    id: over.id ?? 'item-1',
    produtoId: over.produtoId ?? 'prod-1',
    nome: 'Produto',
    quantidade: over.quantidade ?? 2,
    precoOriginal: over.precoOriginal ?? 10,
    precoUnitario: over.precoUnitario ?? 10,
    ...over,
  }
}

function totals(over: Partial<DeclaredTotals> = {}): DeclaredTotals {
  return { totalBruto: 20, totalLiquido: 20, totalDesconto: 0, ...over }
}

describe('checkoutSnapshot', () => {
  it('snapshot é imutável (congelado)', () => {
    const snap = buildCheckoutSnapshot([item()], totals())
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.itens)).toBe(true)
    expect(Object.isFrozen(snap.itens[0])).toBe(true)
  })

  it('aceita carrinho consistente', () => {
    const snap = buildCheckoutSnapshot([item()], totals())
    expect(validateCheckoutSnapshot(snap)).toEqual({ ok: true, violations: [] })
  })

  it('bloqueia carrinho vazio', () => {
    const snap = buildCheckoutSnapshot([], totals({ totalBruto: 0, totalLiquido: 0 }))
    const r = validateCheckoutSnapshot(snap)
    expect(r.ok).toBe(false)
    expect(r.violations.some((v) => v.code === 'CART_EMPTY')).toBe(true)
  })

  it('bloqueia quantidade não-finita / não-positiva', () => {
    const snap = buildCheckoutSnapshot([item({ quantidade: NaN })], totals())
    const r = validateCheckoutSnapshot(snap)
    expect(r.ok).toBe(false)
    expect(r.violations.some((v) => v.code === 'QUANTITY_INVALID')).toBe(true)
  })

  it('bloqueia preço negativo e preço não-finito', () => {
    const neg = validateCheckoutSnapshot(
      buildCheckoutSnapshot([item({ precoUnitario: -1 })], totals()),
    )
    expect(neg.violations.some((v) => v.code === 'PRICE_NEGATIVE')).toBe(true)

    const inf = validateCheckoutSnapshot(
      buildCheckoutSnapshot([item({ precoUnitario: Infinity })], totals()),
    )
    expect(inf.violations.some((v) => v.code === 'PRICE_NOT_FINITE')).toBe(true)
  })

  it('bloqueia precoUnitario acima do precoOriginal', () => {
    const snap = buildCheckoutSnapshot(
      [item({ precoOriginal: 10, precoUnitario: 12 })],
      totals({ totalBruto: 20, totalLiquido: 24 }),
    )
    const r = validateCheckoutSnapshot(snap)
    expect(r.violations.some((v) => v.code === 'UNIT_ABOVE_ORIGINAL')).toBe(true)
  })

  it('FAIL FAST: divergência entre total exibido e total derivado dos itens', () => {
    // Itens somam 20, mas a UI declara 18 → inconsistência entre camadas.
    const snap = buildCheckoutSnapshot([item()], totals({ totalLiquido: 18 }))
    const r = validateCheckoutSnapshot(snap)
    expect(r.ok).toBe(false)
    expect(r.violations.some((v) => v.code === 'TOTAL_MISMATCH')).toBe(true)
  })

  it('bloqueia total negativo', () => {
    const snap = buildCheckoutSnapshot([item()], totals({ totalDesconto: -5 }))
    const r = validateCheckoutSnapshot(snap)
    expect(r.violations.some((v) => v.code === 'TOTAL_NEGATIVE')).toBe(true)
  })
})
