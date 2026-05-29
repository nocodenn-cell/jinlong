'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'

export type RelatorioVendasChartProps = {
  data: Array<{ label: string; total_liquido: number }>
  locale: string
  faturamentoLabel: string
}

export default function RelatorioVendasChart({ data, locale, faturamentoLabel }: RelatorioVendasChartProps) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
          <XAxis
            dataKey="label"
            stroke="rgba(148,163,184,0.7)"
            style={{ fontSize: 11, fontFamily: 'var(--font-numeric)' }}
          />
          <YAxis
            stroke="rgba(148,163,184,0.7)"
            style={{ fontSize: 11, fontFamily: 'var(--font-numeric)' }}
            tickFormatter={(v) => fmtGerenteBRL(Number(v), locale)}
          />
          <Tooltip
            cursor={{ fill: 'rgba(251,191,36,0.08)' }}
            contentStyle={{
              background: 'rgba(2,6,23,0.95)',
              border: '1px solid rgba(148,163,184,0.38)',
              borderRadius: 8,
              color: '#f1f5f9',
              fontSize: 12,
            }}
            formatter={(value) => [fmtGerenteBRL(Number(value ?? 0), locale), faturamentoLabel]}
          />
          <Bar dataKey="total_liquido" fill="#fbbf24" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
