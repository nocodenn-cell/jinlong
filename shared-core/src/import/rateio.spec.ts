import { describe, expect, it } from 'vitest'
import { DecimalErro } from './decimal'
import { ratear, type BaseRateio } from './rateio'

const porId = (partes: readonly { id: string; valor: bigint }[]) =>
  partes.map((p) => [p.id, p.valor] as const)

const erroDe = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof DecimalErro) return e.codigo
    throw e
  }
  return 'SEM_ERRO'
}

describe('ratear', () => {
  it('pesos iguais: resto vai para o id de menor ordem', () => {
    // 10 ÷ 3 = 3 cada, sobra 1 → "a" (id menor) recebe a unidade extra
    const bases: BaseRateio[] = [
      { id: 'b', peso: 1n },
      { id: 'a', peso: 1n },
      { id: 'c', peso: 1n },
    ]
    const r = ratear(10n, bases)
    expect(porId(r.partes)).toEqual([['a', 4n], ['b', 3n], ['c', 3n]])
    expect(r.somaPesos).toBe(3n)
  })

  it('maior resto ganha a sobra, mesmo que o id seja maior', () => {
    // 7 ÷ 3 pesos 2:1 → x = 14/3 = 4 r2; y = 7/3 = 2 r1; sobra 1 → x (maior resto)
    const r = ratear(7n, [{ id: 'x', peso: 2n }, { id: 'y', peso: 1n }])
    expect(porId(r.partes)).toEqual([['x', 5n], ['y', 2n]])
  })

  it('total negativo: mesma distribuição, sinal aplicado às partes', () => {
    const positivo = ratear(10n, [{ id: 'a', peso: 1n }, { id: 'b', peso: 1n }, { id: 'c', peso: 1n }])
    const negativo = ratear(-10n, [{ id: 'a', peso: 1n }, { id: 'b', peso: 1n }, { id: 'c', peso: 1n }])
    expect(negativo.partes.map((p) => p.valor)).toEqual(positivo.partes.map((p) => -p.valor))
  })

  it('soma das partes é exatamente o total, em qualquer caso', () => {
    const total = 10n ** 22n + 7n
    const bases = [1n, 2n, 3n, 5n, 8n, 13n].map((peso, i) => ({ id: `item-${i}`, peso }))
    const r = ratear(total, bases)
    expect(r.partes.reduce((s, p) => s + p.valor, 0n)).toBe(total)
    // cada parte fica a no máximo 1 unidade de sua parte exata
    for (const p of r.partes) {
      const exata = (total * p.peso) / r.somaPesos
      expect(p.valor - exata >= 0n && p.valor - exata <= 1n).toBe(true)
    }
  })

  it('base zero em um item: esse item recebe zero, sem erro', () => {
    const r = ratear(9n, [{ id: 'a', peso: 0n }, { id: 'b', peso: 3n }])
    expect(porId(r.partes)).toEqual([['a', 0n], ['b', 9n]])
  })

  it('total zero distribui zeros', () => {
    const r = ratear(0n, [{ id: 'a', peso: 2n }, { id: 'b', peso: 5n }])
    expect(porId(r.partes)).toEqual([['a', 0n], ['b', 0n]])
  })

  it('soma dos pesos zero é erro explícito, sem fallback', () => {
    expect(erroDe(() => ratear(5n, [{ id: 'a', peso: 0n }, { id: 'b', peso: 0n }]))).toBe('LANDED_RATEIO_BASE_ZERO')
    expect(erroDe(() => ratear(5n, []))).toBe('LANDED_RATEIO_BASE_ZERO')
  })

  it('peso negativo é erro', () => {
    expect(erroDe(() => ratear(5n, [{ id: 'a', peso: -1n }, { id: 'b', peso: 3n }]))).toBe('LANDED_RATEIO_BASE_NEGATIVA')
  })

  it('resultado não depende da ordem de entrada das bases', () => {
    const bases: BaseRateio[] = [
      { id: 'c', peso: 4n }, { id: 'a', peso: 7n }, { id: 'b', peso: 4n }, { id: 'd', peso: 1n },
    ]
    const r1 = ratear(101n, bases)
    const r2 = ratear(101n, [...bases].reverse())
    expect(r2).toEqual(r1)
  })

  it('partes saem em ordem crescente de id', () => {
    const r = ratear(50n, [{ id: 'z', peso: 1n }, { id: 'm', peso: 1n }, { id: 'a', peso: 1n }])
    expect(r.partes.map((p) => p.id)).toEqual(['a', 'm', 'z'])
  })
})
