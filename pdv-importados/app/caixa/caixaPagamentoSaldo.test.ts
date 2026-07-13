import { describe, expect, it } from 'vitest'
import {
  SALDO_PENDENTE_EPS,
  calcularResumoParcelas,
  pagamentoParcialExigeCliente,
} from './caixaPagamentoSaldo'

describe('caixaPagamentoSaldo', () => {
  it('calcularResumoParcelas: saldo pendente quando parcelas < total', () => {
    const r = calcularResumoParcelas(100, 40)
    expect(r.somaParcelas).toBe(40)
    expect(r.saldoPendente).toBe(60)
    expect(r.diferenca).toBe(-60)
  })

  it('calcularResumoParcelas: quitado (diferença 0)', () => {
    const r = calcularResumoParcelas(30, 30)
    expect(r.saldoPendente).toBe(0)
    expect(r.diferenca).toBe(0)
  })

  it('calcularResumoParcelas: excesso de parcelas', () => {
    const r = calcularResumoParcelas(30, 35)
    expect(r.diferenca).toBe(5)
    expect(r.saldoPendente).toBe(-5)
  })

  it('pagamentoParcialExigeCliente: true só com saldo acima do EPS e sem cliente', () => {
    expect(pagamentoParcialExigeCliente(0.01, null)).toBe(true)
    expect(pagamentoParcialExigeCliente(SALDO_PENDENTE_EPS, null)).toBe(false)
    expect(pagamentoParcialExigeCliente(10, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false)
    expect(pagamentoParcialExigeCliente(0, undefined)).toBe(false)
  })
})
