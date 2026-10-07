import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusBadgeTone = 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASS: Record<StatusBadgeTone, string> = {
  success:
    'bg-[var(--color-success-bg)] text-[var(--color-success-strong)] border-[var(--color-success-border)]',
  warning:
    'bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)] border-[var(--color-warning-border)]',
  danger:
    'bg-[var(--color-danger-bg,var(--color-warning-bg))] text-[var(--color-danger-strong)] border-[var(--color-danger-border,var(--color-warning-border))]',
  neutral: 'bg-[var(--color-surface-muted,transparent)] text-fg-subtle border-[var(--color-border)]',
}

type StatusBadgeProps = {
  tone?: StatusBadgeTone
  children: ReactNode
  className?: string
}

/**
 * StatusBadge — pill semântica para status críticos (divergência, estoque baixo, cancelamento).
 */
export function StatusBadge({ tone = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none tracking-wide',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
