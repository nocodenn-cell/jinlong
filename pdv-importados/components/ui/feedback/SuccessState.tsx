import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SuccessStateProps = {
  title: string
  description?: string
  className?: string
}

export function SuccessState({ title, description, className }: SuccessStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-4 py-10 text-center',
        className,
      )}
    >
      <CheckCircle2 className="h-6 w-6 text-[var(--color-success-strong)]" aria-hidden />
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-title font-semibold text-[var(--color-fg)]">{title}</p>
        {description ? (
          <p className="text-body text-[var(--color-fg-muted)]">{description}</p>
        ) : null}
      </div>
    </div>
  )
}
