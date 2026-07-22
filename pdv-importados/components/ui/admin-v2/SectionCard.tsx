import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionCardProps = {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** SectionCard — container de seção Admin (tokens DS). */
export function SectionCard({ title, subtitle, action, children, className }: SectionCardProps) {
  return (
    <section
      className={cn(
        'admin-v2-section-card flex h-full flex-col rounded-card p-4',
        className,
      )}
    >
      {title ? (
        <div className="mb-3 flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
          <div>
            <h2 className="text-title font-semibold text-fg">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-body text-fg-subtle">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
