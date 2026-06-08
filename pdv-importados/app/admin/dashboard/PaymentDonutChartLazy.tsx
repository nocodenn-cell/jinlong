'use client'

import dynamic from 'next/dynamic'
import type { PaymentDonutSlice } from './_components/PaymentDonutChart'

const PaymentDonutChartDynamic = dynamic(
  () => import('./_components/PaymentDonutChart'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-jl-border-1 bg-jl-surface-soft text-sm text-jl-fg-3">
        Carregando gráfico…
      </div>
    ),
  }
)

export type PaymentDonutChartLazyProps = {
  data: PaymentDonutSlice[]
  total: number
}

export function PaymentDonutChartLazy(props: PaymentDonutChartLazyProps) {
  return <PaymentDonutChartDynamic {...props} />
}
