'use client'

import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { drawSparkline, sparkColor, type SparkTone } from './sparkline'

type MetricCardProps = {
  label: string
  value: string
  sparkData?: number[]
  tone?: SparkTone
  delta?: { value: string; up: boolean }
  deltaPositiveIsGood?: boolean
  icon?: LucideIcon
  hint?: string
  className?: string
}

export function MetricCard({
  label,
  value,
  sparkData = [],
  tone = 'gold',
  delta,
  deltaPositiveIsGood = true,
  icon: Icon,
  hint,
  className,
}: MetricCardProps) {
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
    <div className={cn('admin-v2-metric-card flex min-h-[148px] flex-col gap-4 rounded-lg p-5', className)}>
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
              deltaGood ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {delta.up ? '↑' : '↓'} {delta.value}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-3xl font-semibold leading-none tabular-nums text-jl-fg-1 md:text-4xl">
            {value}
          </div>
          {hint ? <p className="mt-2 text-[11px] text-jl-fg-3">{hint}</p> : null}
        </div>
        {sparkData.length >= 2 ? (
          <canvas ref={canvasRef} className="h-[44px] w-[100px] shrink-0" aria-hidden />
        ) : null}
      </div>
    </div>
  )
}
