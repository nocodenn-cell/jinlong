import { roundAbnt } from '../money/roundAbnt'
import type { Cents } from './types'

/** Converte reais (number) para centavos inteiros usando o arredondamento ABNT. */
export function toCents(reais: number): Cents {
  return Math.round(roundAbnt(reais, 2) * 100) as Cents
}

/** Converte centavos inteiros para reais com 2 casas decimais (ABNT). */
export function toReais(cents: Cents): number {
  return roundAbnt(cents / 100, 2)
}
