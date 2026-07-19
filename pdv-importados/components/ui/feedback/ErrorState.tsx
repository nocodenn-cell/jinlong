import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ErrorStateProps = {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
  /** Formulários / banners compactos (ex.: Login). */
  dense?: boolean
}

export function ErrorState({
  title = 'Algo deu errado',
  description = 'Não foi possível carregar estes dados.',
  onRetry,
  retryLabel = 'Tentar novamente',
  className,
  dense = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-center',
        dense ? 'gap-1.5 px-3 py-2.5' : 'px-4 py-10',
        className,
      )}
    >
      <AlertCircle
        className={cn(
          'text-[var(--color-danger)]',
          dense ? 'h-4 w-4' : 'h-6 w-6',
        )}
        aria-hidden
      />
      <div className="flex max-w-sm flex-col gap-1">
        {dense ? (
          <p className="text-small text-[var(--color-danger)]">{description || title}</p>
        ) : (
          <>
            <p className="text-title font-semibold text-[var(--color-fg)]">{title}</p>
            <p className="text-body text-[var(--color-fg-muted)]">{description}</p>
          </>
        )}
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
