import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LoadingProps = {
  label?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /**
   * `spinner` (padrão) — Loader2 na cor da marca.
   * `brand` — selo Jīn Lóng girando em sentido horário; só para carregamento de tela cheia.
   */
  variant?: 'spinner' | 'brand'
}

const SIZE = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const

const BRAND_SIZE = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
} as const

/** Spinner canônico de rota / bloco. */
export function Loading({
  label = 'Carregando…',
  className,
  size = 'md',
  variant = 'spinner',
}: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-[40vh] flex-col items-center justify-center gap-3 bg-[var(--color-surface-soft)]',
        className,
      )}
    >
      {variant === 'brand' ? (
        // eslint-disable-next-line @next/next/no-img-element -- brand logo estático; dimensões fixas no CSS
        <img
          src="/branding/brand-double-dragon.png"
          alt=""
          aria-hidden
          draggable={false}
          data-testid="loading-brand-mark"
          className={cn(
            'animate-[spin_2.8s_linear_infinite] object-contain motion-reduce:animate-pulse',
            BRAND_SIZE[size],
          )}
        />
      ) : (
        <Loader2
          className={cn('animate-spin text-[var(--color-brand)]', SIZE[size])}
          aria-hidden
        />
      )}
      <p className="text-body text-[var(--color-fg-muted)]">{label}</p>
    </div>
  )
}
