'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Valor em reais (ex.: 12.34). `null`/`undefined` renderiza o campo vazio. */
  value: number | null | undefined
  onValueChange: (value: number | null) => void
}

/**
 * Input monetário único do sistema: o usuário digita apenas números e o
 * componente desloca os dígitos em centavos (ex.: "1234" → "R$ 12,34"),
 * sem exigir vírgula/ponto. Substitui implementações duplicadas de
 * máscara/parse de moeda espalhadas pelo app.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onValueChange, onFocus, ...props }, ref) => {
    const cents = value != null && Number.isFinite(value) ? Math.round(value * 100) : 0
    const display = cents === 0 ? '' : formatBRL(cents / 100)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
      if (digits === '') {
        onValueChange(null)
        return
      }
      onValueChange(parseInt(digits, 10) / 100)
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        onFocus={(e) => {
          // move o cursor para o fim, já que a digitação empurra os centavos da direita
          const el = e.currentTarget
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
          onFocus?.(e)
        }}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)
CurrencyInput.displayName = 'CurrencyInput'

export { CurrencyInput }
