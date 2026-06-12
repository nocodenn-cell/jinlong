'use client'

import dynamic from 'next/dynamic'
import type { PaymentDonutSlice } from './_components/PaymentDonutChart'

const PaymentDonutChartDynamic = dynamic(
  () => import('./_components/PaymentDonutChart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse rounded-md bg-jl-surface-soft" aria-hidden />
    ),
  }
)

export type PaymentDonutChartLazyProps = {
  data: PaymentDonutSlice[]
  total: number
  noDataLabel: string
  distributionLabel: string
}

export function PaymentDonutChartLazy(props: PaymentDonutChartLazyProps) {
  return <PaymentDonutChartDynamic {...props} />
}
