'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

export type TabNavItem = {
  id: string
  label: string
  /** Se presente, renderiza como Link (URL-driven). */
  href?: string
}

type TabNavProps = {
  items: readonly TabNavItem[]
  /** Aba ativa (id). */
  value: string
  /** Modo controlled sem URL. */
  onChange?: (id: string) => void
  className?: string
  'aria-label'?: string
}

/**
 * TabNav — abas Admin URL ou controlled (Sprint 0).
 */
export function TabNav({
  items,
  value,
  onChange,
  className,
  'aria-label': ariaLabel = 'Abas',
}: TabNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-0.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-0.5',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value
        const cls = cn(
          'fp-focus-ring rounded-sm px-3 py-1.5 text-caption font-medium transition-colors',
          active
            ? 'bg-[var(--color-info-bg)] text-brand'
            : 'text-fg-subtle hover:text-fg',
        )
        if (item.href) {
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cls}
            >
              {item.label}
            </Link>
          )
        }
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            className={cls}
            onClick={() => onChange?.(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
