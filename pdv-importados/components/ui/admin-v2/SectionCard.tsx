import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionCardProps = {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function SectionCard({ title, subtitle, action, children, className }: SectionCardProps) {
  return (
    <section className={cn('admin-v2-section-card rounded-lg p-6', className)}>
      {title ? (
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-[#242424] pb-3">
          <div>
            <h2 className="text-lg font-semibold text-jl-fg-1">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-jl-fg-3">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}
