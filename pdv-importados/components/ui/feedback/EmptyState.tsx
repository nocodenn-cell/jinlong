import * as React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type EmptyStateProps = {
  title: string
  description?: string
  icon?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/**
 * Empty canônico — Lucide + título + descrição + CTA.
 * Proibido emoji/glifo ad hoc por tela.
 */
export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-12 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-surface-soft)] text-[var(--color-fg-subtle)]">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden />}
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-title font-semibold text-[var(--color-fg)]">{title}</p>
        {description ? (
          <p className="text-body text-[var(--color-fg-muted)]">{description}</p>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <Button type="button" variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
