'use client'

import { useEffect, useState } from 'react'
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

export function SalesTrendChart({ data }: { data: SalesPoint[] }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  if (!ready) {
    return <div className="h-full w-full animate-pulse rounded-md bg-slate-50" />
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorSalesReal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1890ff" stopOpacity={0.14} />
            <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#8c8c8c', fontSize: 12 }}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8c8c8c', fontSize: 12 }} />
        <Tooltip formatter={(v) => Number(v).toLocaleString('pt-BR')} />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#1890ff"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorSalesReal)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

