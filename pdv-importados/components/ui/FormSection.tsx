import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type FormSectionProps = {
  title: string
  description?: string
  children: ReactNode
  className?: string
  /** Grid de campos (default 1 col; sm:2). */
  dense?: boolean
}

/**
 * FormSection — ritmo de formulário Admin (Sprint 0 / IX-FORM).
 */
export function FormSection({
  title,
  description,
  children,
  className,
  dense = false,
}: FormSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <header className="space-y-1">
        <h2 className="text-body font-semibold text-fg">{title}</h2>
        {description ? <p className="text-caption text-fg-subtle">{description}</p> : null}
      </header>
      <div
        className={cn(
          'grid gap-3',
          dense ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
        )}
      >
        {children}
      </div>
    </section>
  )
}
