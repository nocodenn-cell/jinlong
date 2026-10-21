import { describe, expect, it } from 'vitest'
import {
  DecimalErro,
  arredondaHalfUp,
  divide,
  formataDecimal,
  multiplica,
  parseDecimal,
  reescala,
} from './decimal'

const codigo = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof DecimalErro) return e.codigo
    throw e
  }
  return 'SEM_ERRO'
}

describe('parseDecimal', () => {
  it('lê valores com e sem sinal, na escala pedida', () => {
    expect(parseDecimal('1.5', 2)).toBe(150n)
    expect(parseDecimal('-0.005', 3)).toBe(-5n)
    expect(parseDecimal('12', 0)).toBe(12n)
    expect(parseDecimal('0', 4)).toBe(0n)
    expect(parseDecimal('-0', 4)).toBe(0n)
  })

  it('rejeita formatos que não são decimal simples', () => {
    for (const ruim of ['+1', '1e3', '.5', '1.', ' 1', '1 ', '1,5', '', 'abc', '--1', '1.2.3']) {
      expect(codigo(() => parseDecimal(ruim, 6)), ruim).toBe('LANDED_DECIMAL_FORMATO')
    }
  })

  it('rejeita não-string, mesmo que pareça número', () => {
    expect(codigo(() => parseDecimal(1, 2))).toBe('LANDED_DECIMAL_FORMATO')
    expect(codigo(() => parseDecimal(null, 2))).toBe('LANDED_DECIMAL_FORMATO')
    expect(codigo(() => parseDecimal(undefined, 2))).toBe('LANDED_DECIMAL_FORMATO')
  })

  it('rejeita casas além da escala, inclusive zeros à direita', () => {
    expect(codigo(() => parseDecimal('1.1234567', 6))).toBe('LANDED_DECIMAL_ESCALA_EXCEDIDA')
    expect(codigo(() => parseDecimal('1.000000000', 6))).toBe('LANDED_DECIMAL_ESCALA_EXCEDIDA')
    expect(codigo(() => parseDecimal('1.5', 0))).toBe('LANDED_DECIMAL_ESCALA_EXCEDIDA')
  })

  it('aceita exatamente a escala máxima', () => {
    expect(parseDecimal('0.0000000001', 10)).toBe(1n)
    expect(parseDecimal('-9999999999.9999999999', 10)).toBe(-99999999999999999999n)
  })
})

describe('arredondaHalfUp (empate longe de zero)', () => {
  it('arredonda empates para longe de zero, nos dois sinais', () => {
    expect(arredondaHalfUp(5n, 2n)).toBe(3n) // 2.5 → 3
    expect(arredondaHalfUp(-5n, 2n)).toBe(-3n) // −2.5 → −3
    expect(arredondaHalfUp(1n, 2n)).toBe(1n) // 0.5 → 1
    expect(arredondaHalfUp(-1n, 2n)).toBe(-1n) // −0.5 → −1
  })

  it('arredonda sem empate para o vizinho mais próximo', () => {
    expect(arredondaHalfUp(7n, 3n)).toBe(2n) // 2.33 → 2
    expect(arredondaHalfUp(8n, 3n)).toBe(3n) // 2.67 → 3
    expect(arredondaHalfUp(-7n, 3n)).toBe(-2n)
    expect(arredondaHalfUp(0n, 7n)).toBe(0n)
  })

  it('rejeita denominador zero ou negativo', () => {
    expect(codigo(() => arredondaHalfUp(1n, 0n))).toBe('LANDED_DIVISAO_POR_ZERO')
    expect(codigo(() => arredondaHalfUp(1n, -2n))).toBe('LANDED_DIVISAO_POR_ZERO')
  })
})

describe('reescala', () => {
  it('reduz casas com HALF_UP', () => {
    expect(reescala(12345n, 4, 2)).toBe(123n) // 1.2345 → 1.23
    expect(reescala(12350n, 4, 2)).toBe(124n) // 1.2350 → 1.24 (empate)
    expect(reescala(5n, 3, 2)).toBe(1n) // 0.005 → 0.01 (empate)
    expect(reescala(-5n, 3, 2)).toBe(-1n) // −0.005 → −0.01
  })

  it('aumenta casas sem perda', () => {
    expect(reescala(5n, 2, 4)).toBe(500n) // 0.05 → 0.0500
  })

  it('mesma escala devolve o mesmo valor', () => {
    expect(reescala(123n, 4, 4)).toBe(123n)
  })
})

describe('multiplica e divide', () => {
  it('produto exato de dinheiro × taxa de câmbio (1200 USD × 5,4321)', () => {
    // 1200.000000 (escala 6) × 5.4321000000 (escala 10) = 6518.52 em escala 10
    expect(multiplica(1200000000n, 6, 54321000000n, 10, 10)).toBe(65185200000000n)
    expect(formataDecimal(65185200000000n, 10)).toBe('6518.5200000000')
  })

  it('quociente com HALF_UP: 3,33333 ÷ 12 = 0,2777775 → 0,277778 (empate)', () => {
    expect(divide(3333330n, 6, 12000n, 3, 6)).toBe(277778n)
  })

  it('quociente sem empate', () => {
    // 10 ÷ 6 = 1.6666… → escala 6 = 1.666667
    expect(divide(100000n, 4, 6000n, 3, 6)).toBe(1666667n)
  })

  it('divisão por zero é erro explícito, nunca Infinity', () => {
    expect(codigo(() => divide(1n, 0, 0n, 0, 4))).toBe('LANDED_DIVISAO_POR_ZERO')
  })
})

describe('formataDecimal', () => {
  it('sempre emite exatamente a escala pedida', () => {
    expect(formataDecimal(7n, 0)).toBe('7')
    expect(formataDecimal(0n, 2)).toBe('0.00')
    expect(formataDecimal(-5n, 3)).toBe('-0.005')
    expect(formataDecimal(-12345n, 2)).toBe('-123.45')
    expect(formataDecimal(1n, 10)).toBe('0.0000000001')
  })

  it('round-trip: parse(format(v)) = v', () => {
    for (const v of [0n, 1n, -1n, 123456789n, -987654321n]) {
      expect(parseDecimal(formataDecimal(v, 6), 6)).toBe(v)
    }
  })
})
