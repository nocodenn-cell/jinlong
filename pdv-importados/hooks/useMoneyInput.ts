import { useCallback, useState } from 'react'

function formatBRLInput(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseBRLInput(display: string): number | null {
  if (!display.trim()) return null
  // Remove thousands dots, replace decimal comma with dot
  const normalized = display.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function filterBRLChars(raw: string): string {
  // Only digits and comma
  let v = raw.replace(/[^\d,]/g, '')
  // At most one comma
  const parts = v.split(',')
  if (parts.length > 2) {
    v = parts[0] + ',' + parts.slice(1).join('')
  }
  // At most 2 decimal places
  if (parts.length === 2 && parts[1].length > 2) {
    v = parts[0] + ',' + parts[1].slice(0, 2)
  }
  return v
}

export type MoneyInputBag = {
  display: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  parse: () => number | null
  reset: (value?: number | null) => void
}

export function useMoneyInput(initial?: number | null): MoneyInputBag {
  const [display, setDisplay] = useState<string>(() =>
    initial != null && Number.isFinite(initial) && initial !== 0
      ? formatBRLInput(initial)
      : ''
  )

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(filterBRLChars(e.target.value))
  }, [])

  const parse = useCallback((): number | null => {
    return parseBRLInput(display)
  }, [display])

  const reset = useCallback((value?: number | null) => {
    setDisplay(
      value != null && Number.isFinite(value) && value !== 0
        ? formatBRLInput(value)
        : ''
    )
  }, [])

  return { display, onChange, parse, reset }
}
