import { useCallback, useState } from 'react'
import { filterBRLChars, formatDecimalBRL, parseBRL } from '@/lib/format/money'

export { filterBRLChars } from '@/lib/format/money'

export type MoneyInputBag = {
  display: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  parse: () => number | null
  reset: (value?: number | null) => void
}

export function useMoneyInput(initial?: number | null): MoneyInputBag {
  const [display, setDisplay] = useState<string>(() =>
    initial != null && Number.isFinite(initial) && initial !== 0
      ? formatDecimalBRL(initial)
      : ''
  )

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(filterBRLChars(e.target.value))
  }, [])

  const parse = useCallback((): number | null => {
    return parseBRL(display)
  }, [display])

  const reset = useCallback((value?: number | null) => {
    setDisplay(
      value != null && Number.isFinite(value) && value !== 0
        ? formatDecimalBRL(value)
        : ''
    )
  }, [])

  return { display, onChange, parse, reset }
}
