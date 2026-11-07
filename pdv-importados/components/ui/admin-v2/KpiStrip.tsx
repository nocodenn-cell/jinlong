import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MetricCard, type MetricCardIconKey } from './MetricCard'
import type { SparkTone } from './sparkline'

export type KpiStripItem = {
  id: string
  label: string
  value: string
  delta?: { value: string; up: boolean; neutral?: boolean }
  deltaPositiveIsGood?: boolean
  icon?: MetricCardIconKey
  sparkData?: number[]
  tone?: SparkTone
  hint?: string
  href?: string
  /** `false` para links que só mudam a query da mesma página (ex.: abrir um drill-down). */
  scroll?: boolean
  labelWrap?: boolean
  sparkAriaLabel?: string
}

type KpiStripProps = {
  items: readonly KpiStripItem[]
  className?: string
  /** Slot opcional após os cards (ex.: CTA de período). */
  trailing?: ReactNode
}

/**
 * KpiStrip — faixa compacta de KPIs com Δ% vs período anterior (via MetricCard).
 */
export function KpiStrip({ items, className, trailing }: KpiStripProps) {
  return (
    <div
      className={cn('admin-v2-grid-kpi', className)}
      data-testid="kpi-strip"
      role="group"
      aria-label="Indicadores"
    >
      {items.map((item) => {
        const card = (
          <MetricCard
            label={item.label}
            value={item.value}
            delta={item.delta}
            deltaPositiveIsGood={item.deltaPositiveIsGood}
            icon={item.icon}
            sparkData={item.sparkData}
            tone={item.tone}
            hint={item.hint}
            labelWrap={item.labelWrap}
            sparkAriaLabel={item.sparkAriaLabel}
          />
        )
        if (!item.href) {
          return <div key={item.id}>{card}</div>
        }
        return (
          <Link
            key={item.id}
            href={item.href}
            scroll={item.scroll}
            className="block rounded-card focus-visible:outline-none focus-visible:shadow-focus"
            aria-label={`${item.label}: ${item.value}. ${item.hint ?? ''}`.trim()}
          >
            {card}
          </Link>
        )
      })}
      {trailing}
    </div>
  )
}
