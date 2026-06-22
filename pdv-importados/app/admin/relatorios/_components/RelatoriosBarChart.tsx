'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatBRL } from '@/lib/format/money'
import { CHART_UI_COLORS, RECHARTS_CURSOR_STYLE } from '@/lib/tokens/chartColors'

type RelatoriosBarChartProps = {
  data: Array<{ label: string; total: number }>
  tooltipLabel: string
}

export function RelatoriosBarChart({ data, tooltipLabel }: RelatoriosBarChartProps) {
  return (
    <div className="h-full min-h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
          <XAxis dataKey="label" stroke={CHART_UI_COLORS.tickStroke} style={{ fontSize: 11 }} />
          <YAxis stroke={CHART_UI_COLORS.tickStroke} style={{ fontSize: 11 }} tickFormatter={(v) => formatBRL(Number(v))} />
          <Tooltip
            cursor={RECHARTS_CURSOR_STYLE}
            contentStyle={{
              background: CHART_UI_COLORS.tooltipBg,
              border: `1px solid ${CHART_UI_COLORS.tooltipBorder}`,
              borderRadius: 8,
              color: CHART_UI_COLORS.tooltipText,
              fontSize: 12,
            }}
            formatter={(value) => [formatBRL(Number(value ?? 0)), tooltipLabel]}
          />
          <Bar dataKey="total" fill="var(--color-chart-gold)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
