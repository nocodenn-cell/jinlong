import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LoadingProps = {
  label?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const

/** Spinner canônico de rota / bloco. */
export function Loading({ label = 'Carregando…', className, size = 'md' }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-[40vh] flex-col items-center justify-center gap-3 bg-[var(--color-surface-soft)]',
        className,
      )}
    >
      <Loader2
        className={cn('animate-spin text-[var(--color-brand)]', SIZE[size])}
        aria-hidden
      />
      <p className="text-body text-[var(--color-fg-muted)]">{label}</p>
    </div>
  )
}
