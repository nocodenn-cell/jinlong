import { describe, expect, it } from 'vitest'
import { somarRecebidoDinheiro } from '@/app/caixa/server/caixaTurnoResumo.impl'

/**
 * O comprovante de fechamento imprime um bloco de conferência de gaveta:
 * `saldo inicial + vendas + suprimentos − sangrias = saldo sistema`.
 * Somar TODAS as formas de pagamento fazia esse bloco não fechar, errando por
 * exatamente o valor recebido em PIX/cartão — que não passa pelo caixa físico.
 */
describe('somarRecebidoDinheiro', () => {
  it('conta apenas DINHEIRO', () => {
    expect(
      somarRecebidoDinheiro([
        { forma_pagamento: 'DINHEIRO', valor: 30 },
        { forma_pagamento: 'PIX', valor: 23.7 },
        { forma_pagamento: 'CARTAO_CREDITO', valor: 100 },
        { forma_pagamento: 'CARTAO_DEBITO', valor: 50 },
      ]),
    ).toBe(30)
  })

  it('reconcilia a gaveta do turno fechado (caso reproduzido)', () => {
    const inicial = 100
    const sangrias = 210
    const suprimentos = 0
    const pagamentos = [
      { forma_pagamento: 'DINHEIRO', valor: 53.7 },
      { forma_pagamento: 'DINHEIRO', valor: 76.41 },
      { forma_pagamento: 'DINHEIRO', valor: 76.41 },
      { forma_pagamento: 'DINHEIRO', valor: 30.0 },
      { forma_pagamento: 'PIX', valor: 23.7 },
    ]
    const dinheiro = somarRecebidoDinheiro(pagamentos)
    expect(dinheiro).toBeCloseTo(236.52, 2)
    expect(inicial + dinheiro + suprimentos - sangrias).toBeCloseTo(126.52, 2)
  })

  it('é indiferente a caixa alta/baixa e a valores ausentes', () => {
    expect(
      somarRecebidoDinheiro([
        { forma_pagamento: 'dinheiro', valor: '10.50' },
        { forma_pagamento: 'DINHEIRO' },
        { valor: 99 },
      ]),
    ).toBe(10.5)
  })

  it('lista vazia soma zero', () => {
    expect(somarRecebidoDinheiro([])).toBe(0)
  })
})
