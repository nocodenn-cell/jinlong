import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type StatCardProps = {
  label: string
  value: string
  delta?: { value: string; up: boolean }
  icon?: LucideIcon
  className?: string
}

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 rounded-[10px] p-4', className)}
      style={{
        background: 'var(--fp-bg-card)',
        border: '1px solid var(--fp-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon ? (
            <Icon
              size={13}
              strokeWidth={2}
              aria-hidden
              style={{ color: 'var(--fp-text-muted)' }}
            />
          ) : null}
          <span
            className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: 'var(--fp-text-muted)' }}
          >
            {label}
          </span>
        </div>
        {delta ? (
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums',
              delta.up ? 'text-success' : 'text-destructive'
            )}
          >
            {delta.up ? '↑' : '↓'} {delta.value}
          </span>
        ) : null}
      </div>

      <div
        className="truncate text-[24px] font-semibold leading-none tabular-nums"
        style={{ color: 'var(--fp-text-primary)' }}
      >
        {value}
      </div>
    </div>
  )
}
