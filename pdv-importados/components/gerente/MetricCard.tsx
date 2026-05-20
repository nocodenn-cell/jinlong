import React from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
}

export function MetricCard({ title, value, icon: Icon, trend, className }: MetricCardProps) {
  return (
    <div className={cn(
      "dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm hover:bg-white/[0.06] transition-colors",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <p className="text-sm font-medium text-jl-fg-3">{title}</p>
          <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{value}</p>
          {trend && (
            <div
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium',
                trend.isPositive
                  ? 'border-success/35 bg-success/10 text-success'
                  : 'border-destructive/35 bg-destructive/10 text-destructive',
              )}
            >
              {trend.isPositive ? "↑" : "↓"}
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/[0.06]">
          <Icon className="h-6 w-6 text-jl-fg-3" />
        </div>
      </div>
    </div>
  )
}
