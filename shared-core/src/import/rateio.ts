/**
 * Rateio determinístico e exato.
 *
 * Distribui um total inteiro (na escala de cálculo) entre bases não negativas,
 * proporcionalmente. A soma das partes é exatamente o total: o resto da divisão
 * é entregue uma unidade por vez aos itens de maior resto, com desempate por `id`
 * em ordem crescente (método do maior resto de Hamilton).
 *
 * Não há tolerância, não há arredondamento e não há fallback de critério:
 * base total zero é erro.
 */

import { LANDED_ERROR_CODES } from './errorCodes'
import { DecimalErro } from './decimal'

export interface BaseRateio {
  /** Identificador do item. Desempate determinístico e ordem de saída. */
  readonly id: string
  /** Peso inteiro, na escala natural do critério. Não negativo. */
  readonly peso: bigint
}

export interface ParteRateio {
  readonly id: string
  readonly peso: bigint
  /** Parte alocada, na mesma escala do `total` informado. Mesmo sinal do total. */
  readonly valor: bigint
}

export interface ResultadoRateio {
  readonly partes: readonly ParteRateio[]
  readonly somaPesos: bigint
}

function comparaId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * @throws DecimalErro `LANDED_RATEIO_BASE_ZERO` se a soma dos pesos for zero;
 *         `LANDED_RATEIO_BASE_NEGATIVA` se algum peso for negativo.
 */
export function ratear(total: bigint, bases: readonly BaseRateio[]): ResultadoRateio {
  for (const b of bases) {
    if (b.peso < 0n) throw new DecimalErro(LANDED_ERROR_CODES.RATEIO_BASE_NEGATIVA, b.id)
  }
  const ordenadas = [...bases].sort((a, b) => comparaId(a.id, b.id))
  const somaPesos = ordenadas.reduce((s, b) => s + b.peso, 0n)
  if (somaPesos === 0n) throw new DecimalErro(LANDED_ERROR_CODES.RATEIO_BASE_ZERO)

  const sinal = total < 0n ? -1n : 1n
  const magnitude = total < 0n ? -total : total

  const linhas = ordenadas.map((b) => {
    const produto = magnitude * b.peso
    return { id: b.id, peso: b.peso, quociente: produto / somaPesos, resto: produto % somaPesos }
  })

  let sobra = magnitude - linhas.reduce((s, l) => s + l.quociente, 0n)
  // Maior resto primeiro; empate: id crescente
  const porResto = [...linhas].sort((a, b) => {
    if (a.resto !== b.resto) return a.resto > b.resto ? -1 : 1
    return comparaId(a.id, b.id)
  })
  for (const l of porResto) {
    if (sobra === 0n) break
    l.quociente += 1n
    sobra -= 1n
  }

  const partes: ParteRateio[] = linhas.map((l) => ({ id: l.id, peso: l.peso, valor: sinal * l.quociente }))
  const soma = partes.reduce((s, p) => s + p.valor, 0n)
  if (soma !== total) throw new DecimalErro(LANDED_ERROR_CODES.CONSERVACAO_FALHOU, 'rateio')
  return { partes, somaPesos }
}
