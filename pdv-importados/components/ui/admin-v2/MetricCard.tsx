import {
  AlertCircle,
  DollarSign,
  FileCheck2,
  ListFilter,
  Package,
  ShoppingBag,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type MetricCardIconKey =
  | 'dollar-sign'
  | 'package'
  | 'shopping-bag'
  | 'alert-circle'
  | 'x-circle'
  | 'wallet-cards'
  | 'list-filter'
  | 'file-check-2'

const METRIC_ICONS = {
  'dollar-sign': DollarSign,
  package: Package,
  'shopping-bag': ShoppingBag,
  'alert-circle': AlertCircle,
  'x-circle': XCircle,
  'wallet-cards': WalletCards,
  'list-filter': ListFilter,
  'file-check-2': FileCheck2,
} as const

type MetricCardProps = {
  label: string
  value: string
  sparkData?: number[]
  tone?: string
  delta?: { value: string; up: boolean }
  deltaPositiveIsGood?: boolean
  icon?: MetricCardIconKey
  hint?: string
  className?: string
}

export function MetricCard({
  label,
  value,
  delta,
  deltaPositiveIsGood = true,
  icon,
  hint,
  className,
}: MetricCardProps) {
  const Icon = icon ? METRIC_ICONS[icon] : null

  const deltaGood = delta
    ? deltaPositiveIsGood
      ? delta.up
      : !delta.up
    : false

  return (
    <div
      className={cn(
        'admin-v2-metric-card grid min-h-32 h-full grid-rows-[auto,1fr,auto] gap-3 rounded-lg p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-jl-card-l1-accent text-jl-accent">
              <Icon size={16} strokeWidth={2} aria-hidden />
            </span>
          ) : null}
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-jl-fg-3">
            {label}
          </span>
        </div>
        {delta ? (
          <span
            className={cn(
              'shrink-0 text-xs font-semibold tabular-nums',
              deltaGood ? 'text-emerald-600' : 'text-red-600',
            )}
          >
            {delta.up ? '↑' : '↓'} {delta.value}
          </span>
        ) : null}
      </div>

      <div className="flex items-end">
        <div className="min-w-0 flex-1">
          <div className="truncate text-3xl font-semibold leading-none tabular-nums text-jl-fg-1 md:text-4xl">
            {value}
          </div>
        </div>
      </div>

      <div className="min-h-6">
        {hint ? <p className="text-[11px] text-jl-fg-3">{hint}</p> : null}
      </div>
    </div>
  )
}
