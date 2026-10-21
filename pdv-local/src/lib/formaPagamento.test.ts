import { describe, expect, it } from 'vitest'
import { descontoGerenteCompativel, normalizarPagamentos } from './formaPagamento'

describe('normalizarPagamentos', () => {
  it('100% em cada forma', () => {
    for (const f of ['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO'] as const) {
      expect(normalizarPagamentos([{ formaPagamento: f, valor: 100 }], 100)).toEqual({
        ok: true, pagamentos: [{ forma_pagamento: f, valor: 100 }], trocoCentavos: 0,
      })
    }
  })
  it('combinado com crédito parcelado', () => {
    const r = normalizarPagamentos(
      [{ formaPagamento: 'DINHEIRO', valor: 50 }, { formaPagamento: 'PIX', valor: 20.3 }, { formaPagamento: 'CARTAO_CREDITO', valor: 29.7, parcelas: 3 }],
      100,
    )
    expect(r).toEqual({ ok: true, trocoCentavos: 0, pagamentos: [
      { forma_pagamento: 'DINHEIRO', valor: 50 }, { forma_pagamento: 'PIX', valor: 20.3 },
      { forma_pagamento: 'CARTAO_CREDITO', valor: 29.7, parcelas: 3 },
    ] })
  })
  it('troco sai do dinheiro e soma enviada == total (centavos exatos: 0.1+0.2)', () => {
    const r = normalizarPagamentos([{ formaPagamento: 'DINHEIRO', valor: 50 }, { formaPagamento: 'PIX', valor: 0.2 }], 0.3)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.trocoCentavos).toBe(4990)
      expect(r.pagamentos).toEqual([{ forma_pagamento: 'DINHEIRO', valor: 0.1 }, { forma_pagamento: 'PIX', valor: 0.2 }])
    }
  })
  it('recusa excesso em cartão/PIX, valor insuficiente, forma repetida e parcelas fora do crédito', () => {
    expect(normalizarPagamentos([{ formaPagamento: 'PIX', valor: 150 }], 100).ok).toBe(false)
    expect(normalizarPagamentos([{ formaPagamento: 'DINHEIRO', valor: 10 }, { formaPagamento: 'CARTAO_DEBITO', valor: 101 }], 100).ok).toBe(false)
    expect(normalizarPagamentos([{ formaPagamento: 'PIX', valor: 60 }], 100).ok).toBe(false)
    expect(normalizarPagamentos([{ formaPagamento: 'PIX', valor: 50 }, { formaPagamento: 'PIX', valor: 50 }], 100).ok).toBe(false)
    expect(normalizarPagamentos([{ formaPagamento: 'CARTAO_DEBITO', valor: 100, parcelas: 2 }], 100).ok).toBe(false)
    expect(normalizarPagamentos([{ formaPagamento: 'CARTAO_CREDITO', valor: 100, parcelas: 25 }], 100).ok).toBe(false)
    expect(normalizarPagamentos([], 100).ok).toBe(false)
  })
  it('desconto de gerente só em dinheiro', () => {
    expect(descontoGerenteCompativel('DINHEIRO', 5)).toBe(true)
    expect(descontoGerenteCompativel('PIX', 5)).toBe(false)
    expect(descontoGerenteCompativel('PIX', 0)).toBe(true)
  })
})
