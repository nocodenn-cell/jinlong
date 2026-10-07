'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PageActionSecondaryItem = {
  id: string
  label: string
  href?: string
  onClick?: () => void
  disabled?: boolean
}

type PageActionsProps = {
  /** CTAs primários (Novo, Salvar…). */
  children?: ReactNode
  /** Ações secundárias agrupadas em dropdown (exportar, filtros avançados, cadastros). */
  secondary?: readonly PageActionSecondaryItem[]
  secondaryLabel?: string
  className?: string
}

/**
 * PageActions — CTAs do cabeçalho + menu unificado de ações secundárias.
 */
export function PageActions({
  children,
  secondary,
  secondaryLabel = 'Mais ações',
  className,
}: PageActionsProps) {
  const hasSecondary = secondary != null && secondary.length > 0

  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2', className)}
      data-testid="page-actions"
    >
      {children}
      {hasSecondary ? (
        <details className="group/page-actions relative">
          <summary
            className={cn(
              'flex cursor-pointer list-none items-center gap-1.5 rounded-control border border-[var(--color-border)]',
              'bg-[var(--color-surface,transparent)] px-2.5 py-1.5 text-small font-medium text-fg',
              'hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_8%,transparent)]',
              'marker:content-none [&::-webkit-details-marker]:hidden',
            )}
            aria-label={secondaryLabel}
          >
            <MoreHorizontal className="h-4 w-4 opacity-70" aria-hidden />
            <span className="hidden sm:inline">{secondaryLabel}</span>
            <ChevronDown
              className="h-3.5 w-3.5 opacity-50 transition group-open/page-actions:rotate-180"
              aria-hidden
            />
          </summary>
          <ul
            className={cn(
              'absolute right-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-control border border-[var(--color-border)]',
              'bg-[var(--color-background-primary)] py-1 shadow-md',
            )}
            role="menu"
          >
            {secondary.map((item) => {
              const classNameItem = cn(
                'flex w-full items-center px-3 py-2 text-left text-small text-fg',
                'hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_10%,transparent)]',
                item.disabled && 'pointer-events-none opacity-40',
              )
              if (item.href && !item.disabled) {
                return (
                  <li key={item.id} role="none">
                    <Link href={item.href} role="menuitem" className={classNameItem}>
                      {item.label}
                    </Link>
                  </li>
                )
              }
              return (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={item.onClick}
                    className={classNameItem}
                  >
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
