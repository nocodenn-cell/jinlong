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
      <div className="h-[350px] w-full">{children}</div>
    </SectionCard>
  )
}
