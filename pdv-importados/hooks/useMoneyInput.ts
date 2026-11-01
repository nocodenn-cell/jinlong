import { useCallback, useState } from 'react'
import {
  parseMoedaEntrada,
  type ResultadoEntradaNumerica,
} from '@shared-core/src/formatting'
import { filterBRLChars, formatDecimalBRL, parseBRL } from '@/lib/format/money'

export { filterBRLChars } from '@/lib/format/money'

export type MoneyInputBag = {
  display: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  parse: () => number | null
  reset: (value?: number | null) => void
  /** Valida o texto atual sem corrigi-lo (só útil no modo estrito). */
  validar: () => ResultadoEntradaNumerica
}

/**
 * `estrito: true` mantém o texto digitado/colado como está (sem filtrar letras
 * nem pontos) e recusa valores inválidos em `parse()`/`validar()`, em vez de
 * transformá-los em outro número ("10.50" → 1050). Padrão legado: filtro BRL.
 */
export function useMoneyInput(
  initial?: number | null,
  opts?: { estrito?: boolean },
): MoneyInputBag {
  const estrito = opts?.estrito === true
  const [display, setDisplay] = useState<string>(() =>
    initial != null && Number.isFinite(initial) && initial !== 0
      ? formatDecimalBRL(initial)
      : ''
  )

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDisplay(estrito ? e.target.value : filterBRLChars(e.target.value))
    },
    [estrito],
  )

  const validar = useCallback((): ResultadoEntradaNumerica => parseMoedaEntrada(display), [display])

  const parse = useCallback((): number | null => {
    if (estrito) {
      const r = parseMoedaEntrada(display)
      return r.ok ? r.value : null
    }
    return parseBRL(display)
  }, [display, estrito])

  const reset = useCallback((value?: number | null) => {
    setDisplay(
      value != null && Number.isFinite(value) && value !== 0
        ? formatDecimalBRL(value)
        : ''
    )
  }, [])

  return { display, onChange, parse, reset, validar }
}
