import type { ReactNode } from 'react'
import { SectionCard } from './SectionCard'

type ChartCardProps = {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}

export function ChartCard({ title, subtitle, children, className }: ChartCardProps) {
  return (
    <SectionCard title={title} subtitle={subtitle} className={className}>
      <div className="admin-v2-chart-area h-full w-full">{children}</div>
    </SectionCard>
  )
}
