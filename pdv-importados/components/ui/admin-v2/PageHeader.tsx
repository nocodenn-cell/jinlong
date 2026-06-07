import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  subtitle?: string
  filters?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, filters, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-8 border-b border-[#242424] pb-5', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-jl-fg-1 md:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-jl-fg-3">{subtitle}</p> : null}
        </div>
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      </div>
    </header>
  )
}
