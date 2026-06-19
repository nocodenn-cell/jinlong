'use client'

import { formatNumberLocale } from '@/lib/format/money'
import { useIdioma } from '@/hooks/useIdioma'
import { ChartLayoutGate } from '@/components/charts/ChartLayoutGate'
import { useEffect, useId, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type SalesPoint = {
  label: string
  total: number
}

const THEMES = {
  default: {
    stroke: '#1890ff',
    stop: '#1890ff',
    grid: '#f0f0f0',
    tick: '#8c8c8c',
  },
  oriental: {
    stroke: '#c42e2e',
    stop: '#c42e2e',
    grid: 'rgba(45, 90, 74, 0.12)',
    tick: '#5c5c5c',
  },
} as const

export default function SalesTrendChart({
  data,
  variant = 'default',
}: {
  data: SalesPoint[]
  variant?: keyof typeof THEMES
}) {
  const [ready, setReady] = useState(false)
  const { idioma } = useIdioma()
  const gradId = useId().replace(/:/g, '')
  const t = THEMES[variant]

  useEffect(() => {
    setReady(true)
  }, [])

  if (!ready) {
    return (
      <div
        className={`h-full w-full animate-pulse rounded-md ${
          variant === 'oriental' ? 'bg-[#fef9e8]/80' : 'border border-jl-border-1 bg-jl-surface-soft'
        }`}
      />
    )
  }

  return (
    <ChartLayoutGate>
      <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} className={idioma === 'zh' ? 'font-noto-sc' : ''}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={t.stop} stopOpacity={0.2} />
            <stop offset="95%" stopColor={t.stop} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: t.tick, fontSize: 12 }}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: t.tick, fontSize: 12 }} />
        <Tooltip formatter={(v) => formatNumberLocale(Number(v), 'pt-BR')} />
        <Area
          type="monotone"
          dataKey="total"
          stroke={t.stroke}
          strokeWidth={2}
          fillOpacity={1}
          fill={`url(#${gradId})`}
        />
      </AreaChart>
      </ResponsiveContainer>
    </ChartLayoutGate>
  )
}

