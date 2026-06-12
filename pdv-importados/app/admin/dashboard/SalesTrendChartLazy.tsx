'use client'

import dynamic from 'next/dynamic'

const SalesTrendChartDynamic = dynamic(
  () => import('./SalesTrendChart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse rounded-md bg-jl-surface-soft" aria-hidden />
    ),
  },
)

export type SalesTrendChartLazyProps = {
  data: Array<{ label: string; total: number }>
  variant?: 'default' | 'oriental'
}

export function SalesTrendChartLazy(props: SalesTrendChartLazyProps) {
  return <SalesTrendChartDynamic {...props} />
}
