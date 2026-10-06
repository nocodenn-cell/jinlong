import { describe, expect, it } from 'vitest'
import {
  calcularDescontoComercialDinheiro,
  isDescontoComercialOperador,
} from './descontoComercialDinheiro'

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

describe('isDescontoComercialOperador', () => {
  it('aceita até 10% sem token com motivo AUTORIZACAO_COMERCIAL', () => {
    expect(isDescontoComercialOperador({
      token: null,
      percentual: 10,
      motivo: 'AUTORIZACAO_COMERCIAL',
    })).toBe(true)
    expect(isDescontoComercialOperador({
      percentual: 5,
      motivo: 'AUTORIZACAO_COMERCIAL',
    })).toBe(true)
  })

  it('rejeita com token, acima de 10%, sem motivo ou percentual inválido', () => {
    expect(isDescontoComercialOperador({
      token: 'tok',
      percentual: 10,
      motivo: 'AUTORIZACAO_COMERCIAL',
    })).toBe(false)
    expect(isDescontoComercialOperador({
      percentual: 10.01,
      motivo: 'AUTORIZACAO_COMERCIAL',
    })).toBe(false)
    expect(isDescontoComercialOperador({
      percentual: 10,
      motivo: 'CORTESIA',
    })).toBe(false)
    expect(isDescontoComercialOperador({
      percentual: 0,
      motivo: 'AUTORIZACAO_COMERCIAL',
    })).toBe(false)
  })
})
