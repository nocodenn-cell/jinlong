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
    <section className={cn('admin-v2-section-card flex h-full flex-col rounded-lg p-4', className)}>
      {title ? (
        <div className="mb-3 flex items-start justify-between gap-4 border-b border-[var(--admin-v2-border)] pb-3">
          <div>
            <h2 className="text-lg font-semibold text-jl-fg-1">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-jl-fg-3">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
