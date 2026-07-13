import { describe, expect, it } from 'vitest'
import {
  EXCESSO_PAGAMENTO_EPS,
  SALDO_PENDENTE_EPS,
  calcularResumoParcelas,
  pagamentoParcialExigeCliente,
} from '@/app/caixa/caixaPagamentoSaldo'

describe('caixaPagamentoSaldo', () => {
  it('EPS canônicos: parcial 0.009 e excesso 0.01', () => {
    expect(SALDO_PENDENTE_EPS).toBe(0.009)
    expect(EXCESSO_PAGAMENTO_EPS).toBe(0.01)
  })

  it('calcularResumoParcelas: underpay e overpay', () => {
    const r = calcularResumoParcelas(100, 40)
    expect(r.somaParcelas).toBe(40)
    expect(r.diferenca).toBe(-60)
    expect(r.saldoPendente).toBe(60)
  })

  it('pagamentoParcialExigeCliente: true só com saldo acima do EPS e sem cliente', () => {
    expect(pagamentoParcialExigeCliente(0.01, null)).toBe(true)
    expect(pagamentoParcialExigeCliente(SALDO_PENDENTE_EPS, null)).toBe(false)
    expect(pagamentoParcialExigeCliente(10, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false)
    expect(pagamentoParcialExigeCliente(0, undefined)).toBe(false)
  })
})
