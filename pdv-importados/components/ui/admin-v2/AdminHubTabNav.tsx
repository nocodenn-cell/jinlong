'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { hubTabIsActive, type HubTabDef } from '@/lib/navigation/hubNavModel'
import type { FinanceiroTabId } from '@/lib/navigation/financeiroTabId'
import { buildFinanceiroHub, type FinanceiroHubLabels } from '@/lib/navigation/financeiroHubGroups'

const HUB_TAB_CLASS =
  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background-primary)]'

type AdminHubTabNavProps = {
  tabs: readonly HubTabDef[]
  ariaLabel: string
}

export function AdminHubTabNav({ tabs, ariaLabel }: AdminHubTabNavProps) {
  const pathname = usePathname() ?? ''

  return (
    <div
      className="sticky top-0 z-20 -mx-1 mb-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-background-primary)] pb-2 pt-1"
      data-hub-tab-nav
    >
      <nav aria-label={ariaLabel} className="flex gap-1 overflow-x-auto overscroll-x-contain pb-0.5">
        {tabs.map((tab) => {
          const active = hubTabIsActive(pathname, tab)
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                HUB_TAB_CLASS,
                'shrink-0 whitespace-nowrap',
                active
                  ? 'bg-jl-surface-elev text-jl-fg-1 shadow-sm'
                  : 'text-jl-fg-3 hover:bg-jl-surface-soft hover:text-jl-fg-1',
              )}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

type FinanceiroHubNavProps = {
  activeTab: FinanceiroTabId
  labels: FinanceiroHubLabels
  ariaLabel: string
  /** aria-label da segunda linha (vistas dentro do grupo). */
  subAriaLabel: string
}

/**
 * Barra do Financeiro: 7 controles + seletor de vistas dentro do grupo (UX-IA-01 PR 5).
 * Todos os `?tab=` continuam válidos — ver `financeiroHubGroups.ts`.
 */
export function FinanceiroHubNav({ activeTab, labels, ariaLabel, subAriaLabel }: FinanceiroHubNavProps) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const { primary, secondary } = buildFinanceiroHub({ pathname, activeTab, searchParams, labels })

  return (
    <div
      className="sticky top-0 z-20 -mx-1 mb-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-background-primary)] pb-2 pt-1"
      data-hub-tab-nav
    >
      <nav aria-label={ariaLabel} className="flex gap-1 overflow-x-auto overscroll-x-contain pb-0.5">
        {primary.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              HUB_TAB_CLASS,
              'shrink-0 whitespace-nowrap',
              item.active
                ? 'bg-jl-surface-elev text-jl-fg-1 shadow-sm'
                : 'text-jl-fg-3 hover:bg-jl-surface-soft hover:text-jl-fg-1',
            )}
            aria-current={item.active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {secondary ? (
        <nav
          aria-label={subAriaLabel}
          data-hub-subnav
          className="mt-1.5 flex gap-1 overflow-x-auto overscroll-x-contain pb-0.5"
        >
          {secondary.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-amber-400/70',
                item.active
                  ? 'bg-[rgba(251,191,36,0.14)] text-jl-fg-1'
                  : 'text-jl-fg-3 hover:bg-jl-surface-soft hover:text-jl-fg-1',
              )}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
