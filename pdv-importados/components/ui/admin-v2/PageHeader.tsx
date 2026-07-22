import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AdminV2UtilityBar } from './AdminV2UtilityBar'

type PageHeaderProps = {
  title: string
  subtitle?: string
  /** Filtros compactos no header (ex.: período). */
  filters?: ReactNode
  /** CTAs principais — preferir `PageActions`. */
  actions?: ReactNode
  className?: string
}

/**
 * PageHeader — cabeçalho canônico Admin (CRUD / gestão).
 * Tipografia / borda / espaçamento via tokens DS.
 */
export function PageHeader({ title, subtitle, filters, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-5 border-b border-[var(--color-border)] pb-5',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-h2 font-bold tracking-tight text-fg md:text-h1">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-body text-fg-subtle">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {filters}
          {actions}
          <AdminV2UtilityBar />
        </div>
      </div>
    </header>
  )
}
