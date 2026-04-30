'use client'

import dynamic from 'next/dynamic'

const SalesTrendChartDynamic = dynamic(
  () => import('./SalesTrendChart'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        Carregando gráfico…
      </div>
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
