'use client'

import { useEffect, useRef } from 'react'
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
import { drawSparkline, sparkColor, type SparkTone } from './sparkline'

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
  tone?: SparkTone
  delta?: { value: string; up: boolean }
  deltaPositiveIsGood?: boolean
  icon?: MetricCardIconKey
  hint?: string
  className?: string
}

/**
 * MetricCard — KPI canônico Admin (Fase 2 · Onda 4).
 * Substitui forks legados (ui/MetricCard, gerente/MetricCard, StatCard).
 */
export function MetricCard({
  label,
  value,
  sparkData = [],
  tone = 'gold',
  delta,
  deltaPositiveIsGood = true,
  icon,
  hint,
  className,
}: MetricCardProps) {
  const Icon = icon ? METRIC_ICONS[icon] : null
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || sparkData.length < 2) return

    const render = () => drawSparkline(canvas, sparkData, sparkColor(tone))
    render()

    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [sparkData, tone])

  const deltaGood = delta
    ? deltaPositiveIsGood
      ? delta.up
      : !delta.up
    : false

  return (
    <div
      className={cn(
        'admin-v2-metric-card grid h-full min-h-32 grid-rows-[auto,1fr,auto] gap-3 rounded-card p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-[var(--color-info-bg)] text-brand">
              <Icon size={16} strokeWidth={2} aria-hidden />
            </span>
          ) : null}
          <span className="truncate text-caption font-semibold uppercase tracking-[var(--letter-spacing-wide)] text-fg-subtle">
            {label}
          </span>
        </div>
        {delta ? (
          <span
            className={cn(
              'shrink-0 text-small font-semibold tabular-nums',
              deltaGood
                ? 'text-[var(--color-success-strong)]'
                : 'text-[var(--color-danger-strong)]',
            )}
          >
            {delta.up ? '↑' : '↓'} {delta.value}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-h2 font-semibold leading-none tabular-nums text-fg md:text-h1">
            {value}
          </div>
        </div>
        <div className="flex h-11 w-24 shrink-0 items-center justify-center">
          {sparkData.length >= 2 ? (
            <canvas ref={canvasRef} className="h-11 w-24 shrink-0" aria-hidden />
          ) : (
            <div className="h-11 w-24" aria-hidden />
          )}
        </div>
      </div>

      <div className="min-h-6">
        {hint ? <p className="text-caption text-fg-subtle">{hint}</p> : null}
      </div>
    </div>
  )
}

/** @deprecated Use MetricCard — alias de consolidação Onda 4. */
export const StatCard = MetricCard
