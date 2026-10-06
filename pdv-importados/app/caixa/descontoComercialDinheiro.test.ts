import { describe, expect, it } from 'vitest'
import { calcularDescontoComercialDinheiro } from './descontoComercialDinheiro'

describe('calcularDescontoComercialDinheiro', () => {
  it('aceita 10% rápido', () => {
    const r = calcularDescontoComercialDinheiro({ subtotal: 100, modo: 'percentual', valor: 10 })
    expect(r.ok).toBe(true)
    expect(r.descontoValor).toBe(10)
    expect(r.totalFinal).toBe(90)
  })

  it('aceita valor em R$ dentro do limite', () => {
    const r = calcularDescontoComercialDinheiro({ subtotal: 200, modo: 'valor', valor: 15 })
    expect(r.ok).toBe(true)
    expect(r.percentual).toBe(7.5)
    expect(r.totalFinal).toBe(185)
  })

  it('rejeita acima de 10%', () => {
    const r = calcularDescontoComercialDinheiro({ subtotal: 100, modo: 'percentual', valor: 10.1 })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('ACIMA_DO_LIMITE')
  })
})
