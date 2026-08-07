import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InlineAlertTone = 'info' | 'success' | 'warning' | 'danger'

type InlineAlertProps = {
  tone?: InlineAlertTone
  title?: string
  children: ReactNode
  className?: string
  role?: 'status' | 'alert'
}

const TONE: Record<
  InlineAlertTone,
  { wrap: string; icon: typeof Info }
> = {
  info: {
    wrap: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-fg)]',
    icon: Info,
  },
  success: {
    wrap: 'border-[var(--color-success-border,var(--color-border))] bg-[var(--fp-success-bg,var(--color-surface-soft))] text-[var(--color-fg)]',
    icon: CheckCircle2,
  },
  warning: {
    wrap: 'border-[var(--color-warning-border,var(--color-border))] bg-[var(--fp-warning-bg,var(--color-surface-soft))] text-[var(--color-fg)]',
    icon: AlertTriangle,
  },
  danger: {
    wrap: 'border-destructive/40 bg-destructive/10 text-destructive',
    icon: XCircle,
  },
}

/**
 * InlineAlert — banner de página/form (Sprint 0 / IX-ERROR).
 */
export function InlineAlert({
  tone = 'info',
  title,
  children,
  className,
  role,
}: InlineAlertProps) {
  const conf = TONE[tone]
  const Icon = conf.icon
  const resolvedRole = role ?? (tone === 'danger' || tone === 'warning' ? 'alert' : 'status')
  return (
    <div
      role={resolvedRole}
      className={cn(
        'flex gap-3 rounded-lg border px-4 py-3 text-body',
        conf.wrap,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-caption opacity-90">{children}</div>
      </div>
    </div>
  )
}
