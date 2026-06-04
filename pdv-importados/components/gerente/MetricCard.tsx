import React from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  tier?: 1 | 2 | 3
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
}

/**
 * Chip de delta direcional (achado #18 da auditoria de front-end). Único ponto
 * de verdade para os 3 tiers — antes o markup era duplicado. Três estados:
 *  - neutro (value === 0): seta horizontal + cinza, "queda irrelevante" não vira alarme
 *  - positivo (jade) / negativo (imperial)
 * Magnitude em tabular-nums; deltas fortes (|Δ| ≥ 10%) ganham negrito + ring p/
 * destacar "queda preocupante" vs "queda irrelevante".
 */
function DeltaChip({
  value,
  isPositive,
  variant = 'chip',
}: {
  value: number
  isPositive: boolean
  /** `chip`: pílula com borda (tier 1/2). `inline`: texto compacto (tier 3). */
  variant?: 'chip' | 'inline'
}) {
  const isNeutral = value === 0
  const strong = Math.abs(value) >= 10
  const arrow = isNeutral ? '→' : isPositive ? '↑' : '↓'
  const tone = isNeutral
    ? 'text-jl-fg-3'
    : isPositive
      ? 'text-success'
      : 'text-destructive'

  if (variant === 'inline') {
    return (
      <span className={cn('text-[10px] tabular-nums', strong ? 'font-bold' : 'font-medium', tone)}>
        <span aria-hidden="true">{arrow}</span>
        {Math.abs(value)}%
      </span>
    )
  }

  const chipTone = isNeutral
    ? 'border-jl-border-2 bg-white/[0.04] text-jl-fg-3'
    : isPositive
      ? 'border-success/30 bg-success/10 text-success'
      : 'border-destructive/30 bg-destructive/10 text-destructive'
  const strongRing = !strong || isNeutral ? '' : isPositive ? 'ring-1 ring-success/40' : 'ring-1 ring-destructive/40'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums',
        strong ? 'font-bold' : 'font-medium',
        chipTone,
        strongRing,
      )}
    >
      <span aria-hidden="true">{arrow}</span>
      {Math.abs(value)}%
    </div>
  )
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  tier = 2,
  trend,
  className,
}: MetricCardProps) {
  if (tier === 1) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border transition-colors',
          'border-jl-card-l1-border bg-jl-card-l1-bg',
          'hover:bg-white/[0.04]',
          className,
        )}
      >
        {/* Left accent strip */}
        <div
          className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl bg-jl-card-l1-strip"
          aria-hidden="true"
        />
        <div className="pl-5 pr-4 py-5 flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-jl-fg-3">
              {title}
            </p>
            <p className="text-[26px] leading-none font-bold text-jl-fg-1 tabular-nums truncate">
              {value}
            </p>
            {trend && <DeltaChip value={trend.value} isPositive={trend.isPositive} />}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jl-card-l1-accent flex-shrink-0">
            <Icon className="h-5 w-5 text-amber-400/70" />
          </div>
        </div>
      </div>
    )
  }

  if (tier === 3) {
    return (
      <div
        className={cn(
          'rounded-lg border px-4 py-3 flex items-center justify-between gap-3',
          'border-jl-card-l3-border bg-jl-card-l3-bg',
          className,
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-jl-fg-3 flex-shrink-0" />
          <p className="text-xs text-jl-fg-3 truncate">{title}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <p className="text-sm font-semibold text-jl-fg-2 tabular-nums">{value}</p>
          {trend && <DeltaChip value={trend.value} isPositive={trend.isPositive} variant="inline" />}
        </div>
      </div>
    )
  }

  // tier === 2 (default) — operacional
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        'border-jl-card-l2-border bg-jl-card-l2-bg',
        'hover:bg-white/[0.03]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-xs font-medium text-jl-fg-3">{title}</p>
          <p className="text-xl font-semibold text-jl-fg-1 tabular-nums truncate">{value}</p>
          {trend && <DeltaChip value={trend.value} isPositive={trend.isPositive} />}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] flex-shrink-0">
          <Icon className="h-4 w-4 text-jl-fg-3" />
        </div>
      </div>
    </div>
  )
}
