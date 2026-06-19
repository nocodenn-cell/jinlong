'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'

export type RelatorioVendasChartProps = {
  data: Array<{ label: string; total_liquido: number }>
  locale: string
  faturamentoLabel: string
}

export default function RelatorioVendasChart({ data, locale, faturamentoLabel }: RelatorioVendasChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[260px] w-full items-center justify-center text-xs text-jl-fg-3">
        Sem dados
      </div>
    )
  }
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {/* stroke/fill viram ATRIBUTOS SVG → não resolvem var()/color-mix; ficam literais. */}
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
            // contentStyle é estilo inline real (div) → tokens resolvem; corrige
            // o tooltip preto sobre fundo creme no tema Nuvem (achado 04).
            contentStyle={{
              background: 'var(--jl-surface-elev)',
              border: '1px solid var(--jl-border-1)',
              borderRadius: 8,
              color: 'var(--jl-fg-1)',
              fontSize: 12,
            }}
            formatter={(value) => [fmtGerenteBRL(Number(value ?? 0), locale), faturamentoLabel]}
          />
          <Bar dataKey="total_liquido" fill="var(--jl-accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
