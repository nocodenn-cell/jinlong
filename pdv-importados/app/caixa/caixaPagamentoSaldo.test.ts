import { describe, expect, it } from 'vitest'
import {
  EXCESSO_PAGAMENTO_EPS,
  SALDO_PENDENTE_EPS,
  avaliarExcessoParcelas,
  calcularResumoParcelas,
  calcularTroco,
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

  describe('calcularTroco', () => {
    it('recebido acima do total → troco positivo, sem saldo, suficiente', () => {
      const r = calcularTroco(87.3, 100)
      expect(r.total).toBe(87.3)
      expect(r.recebido).toBe(100)
      expect(r.troco).toBe(12.7)
      expect(r.saldoPendente).toBe(0)
      expect(r.suficiente).toBe(true)
    })

    it('recebido exato → troco 0 e suficiente', () => {
      const r = calcularTroco(50, 50)
      expect(r.troco).toBe(0)
      expect(r.saldoPendente).toBe(0)
      expect(r.suficiente).toBe(true)
    })

    it('recebido abaixo do total → saldo pendente, sem troco, insuficiente', () => {
      const r = calcularTroco(50, 30)
      expect(r.troco).toBe(0)
      expect(r.saldoPendente).toBe(20)
      expect(r.suficiente).toBe(false)
    })

    it('normaliza negativos para zero', () => {
      const r = calcularTroco(-10, -5)
      expect(r.total).toBe(0)
      expect(r.recebido).toBe(0)
      expect(r.troco).toBe(0)
      expect(r.saldoPendente).toBe(0)
    })

    it('arredonda o troco a 2 casas', () => {
      const r = calcularTroco(33.33, 50)
      expect(r.total).toBe(33.33)
      expect(r.recebido).toBe(50)
      expect(r.troco).toBe(16.67)
    })

    it('tolera ruído de ponto flutuante (0.1 + 0.2 cobre 0.30)', () => {
      const r = calcularTroco(0.1 + 0.2, 0.3)
      expect(r.saldoPendente).toBe(0)
      expect(r.suficiente).toBe(true)
    })
  })

  describe('avaliarExcessoParcelas', () => {
    it('sem parcela DINHEIRO: excesso nunca é troco válido (regressão — cartão/PIX não pode ser subtraído)', () => {
      const r = avaliarExcessoParcelas(
        [
          { formaPagamento: 'CARTAO_DEBITO', valor: 60 },
          { formaPagamento: 'CARTAO_CREDITO', valor: 50 },
        ],
        10,
      )
      expect(r.idxDinheiro).toBe(-1)
      expect(r.dinheiroDisponivel).toBe(0)
      expect(r.trocoValido).toBe(false)
    })

    it('com DINHEIRO suficiente para cobrir o excesso: troco válido', () => {
      const r = avaliarExcessoParcelas(
        [
          { formaPagamento: 'CARTAO_DEBITO', valor: 40 },
          { formaPagamento: 'DINHEIRO', valor: 70 },
        ],
        10,
      )
      expect(r.idxDinheiro).toBe(1)
      expect(r.dinheiroDisponivel).toBe(70)
      expect(r.trocoValido).toBe(true)
    })

    it('com DINHEIRO insuficiente para cobrir o excesso inteiro: troco inválido', () => {
      const r = avaliarExcessoParcelas(
        [
          { formaPagamento: 'DINHEIRO', valor: 5 },
          { formaPagamento: 'CARTAO_CREDITO', valor: 100 },
        ],
        10,
      )
      expect(r.idxDinheiro).toBe(0)
      expect(r.dinheiroDisponivel).toBe(5)
      expect(r.trocoValido).toBe(false)
    })

    it('usa a última parcela DINHEIRO quando há mais de uma', () => {
      const r = avaliarExcessoParcelas(
        [
          { formaPagamento: 'DINHEIRO', valor: 3 },
          { formaPagamento: 'DINHEIRO', valor: 20 },
        ],
        10,
      )
      expect(r.idxDinheiro).toBe(1)
      expect(r.dinheiroDisponivel).toBe(20)
      expect(r.trocoValido).toBe(true)
    })
  })
})
