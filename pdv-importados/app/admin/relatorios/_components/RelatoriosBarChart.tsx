'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatBRL } from '@/lib/format/money'

type RelatoriosBarChartProps = {
  data: Array<{ label: string; total: number }>
}

export function RelatoriosBarChart({ data }: RelatoriosBarChartProps) {
  return (
    <div className="h-full min-h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
          <XAxis dataKey="label" stroke="#7a7a7a" style={{ fontSize: 11 }} />
          <YAxis stroke="#7a7a7a" style={{ fontSize: 11 }} tickFormatter={(v) => formatBRL(Number(v))} />
          <Tooltip
            cursor={{ fill: 'rgba(201,162,39,0.12)' }}
            contentStyle={{
              background: '#101010',
              border: '1px solid #242424',
              borderRadius: 8,
              color: '#f5f5f5',
              fontSize: 12,
            }}
            formatter={(value) => [formatBRL(Number(value ?? 0)), 'Faturado']}
          />
          <Bar dataKey="total" fill="#c9a227" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
