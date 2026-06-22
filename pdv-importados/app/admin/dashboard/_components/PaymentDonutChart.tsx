'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatBRL } from '@/lib/format/money'
import { ChartLayoutGate } from '@/components/charts/ChartLayoutGate'

export type PaymentSlice = {
  label: string
  value: number
  color: string
}

/** Donut estático (conic-gradient) — usado em relatórios sem recharts lazy. */
export function PaymentDonutChart({ slices }: { slices: PaymentSlice[] }) {
  const safeSlices = slices.length > 0 ? slices : [{ label: 'Sem dados', value: 1, color: '#6b7280' }]
  const total = safeSlices.reduce((acc, s) => acc + Math.max(0, s.value), 0) || 1
  let cursor = 0
  const gradient = safeSlices
    .map((slice) => {
      const start = (cursor / total) * 100
      cursor += Math.max(0, slice.value)
      const end = (cursor / total) * 100
      return `${slice.color} ${start}% ${end}%`
    })
    .join(', ')

  return (
    <div className="flex h-full items-center gap-4">
      <div
        className="h-36 w-36 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${gradient})`,
          mask: 'radial-gradient(circle at center, transparent 45%, black 46%)',
          WebkitMask: 'radial-gradient(circle at center, transparent 45%, black 46%)',
        }}
      />
      <div className="space-y-2">
        {safeSlices.map((slice) => (
          <div key={slice.label} className="flex items-center gap-2 text-xs text-jl-fg-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
            <span>{slice.label}</span>
            <span className="font-medium text-jl-fg-1">{slice.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export type PaymentDonutSlice = {
  name: string
  value: number
}

const COLORS = ['#c9a227', '#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#f87171']

type PaymentDonutChartRechartsProps = {
  data: PaymentDonutSlice[]
  total: number
  noDataLabel: string
  distributionLabel: string
}

/** Donut recharts — carregado via PaymentDonutChartLazy no dashboard. */
export default function PaymentDonutChartRecharts({ data, total, noDataLabel, distributionLabel }: PaymentDonutChartRechartsProps) {
  const hasData = data.some((entry) => entry.value > 0)

  if (!hasData) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-jl-border-1 bg-jl-surface-soft px-4 text-center text-sm text-jl-fg-3">
        {noDataLabel}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-end justify-between">
        <p className="text-xs text-jl-fg-3">{distributionLabel}</p>
        <p className="text-xs font-medium text-[#c9a227]">{formatBRL(total)}</p>
      </div>
      <div className="min-h-0 flex-1">
        <ChartLayoutGate>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={86}
              paddingAngle={2}
              stroke="#0f0f0f"
              strokeWidth={2}
            >
              {data.map((entry, idx) => (
                <Cell key={`${entry.name}-${idx}`} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatBRL(Number(v ?? 0))}
              contentStyle={{
                background: '#111111',
                border: '1px solid #242424',
                borderRadius: 10,
              }}
              labelStyle={{ color: '#a3a3a3' }}
            />
          </PieChart>
        </ResponsiveContainer>
        </ChartLayoutGate>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-jl-fg-3">
        {data.map((entry, idx) => (
          <div key={`${entry.name}-legend`} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: COLORS[idx % COLORS.length] }}
              aria-hidden
            />
            <span className="truncate">
              {entry.name}: {formatBRL(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
