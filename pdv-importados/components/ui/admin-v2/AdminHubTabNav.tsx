'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ROUTES } from '@shared-core/navigation/routes'
import { cn } from '@/lib/utils'
import { hubTabIsActive, type HubTabDef } from '@/lib/navigation/hubNavModel'
import { financeiroHrefForTab } from '@/lib/navigation/financeiroHubQuery'

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
  activeTab: 'receber' | 'pagar' | 'fiscal'
  labels: {
    receber: string
    pagar: string
    fiscal: string
    categorias: string
  }
  ariaLabel: string
}

export function FinanceiroHubNav({ activeTab, labels, ariaLabel }: FinanceiroHubNavProps) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const onFinanceiro = pathname === ROUTES.admin.financeiro
  const onCategorias = pathname.startsWith(ROUTES.admin.categoriasFinanceiras)

  const items: Array<{ id: string; label: string; href: string; active: boolean }> = [
    {
      id: 'receber',
      label: labels.receber,
      href: financeiroHrefForTab('receber', searchParams),
      active: onFinanceiro && activeTab === 'receber',
    },
    {
      id: 'pagar',
      label: labels.pagar,
      href: financeiroHrefForTab('pagar', searchParams),
      active: onFinanceiro && activeTab === 'pagar',
    },
    {
      id: 'fiscal',
      label: labels.fiscal,
      href: financeiroHrefForTab('fiscal', searchParams),
      active: onFinanceiro && activeTab === 'fiscal',
    },
    {
      id: 'categorias',
      label: labels.categorias,
      href: ROUTES.admin.categoriasFinanceiras,
      active: onCategorias,
    },
  ]

  return (
    <div
      className="sticky top-0 z-20 -mx-1 mb-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-background-primary)] pb-2 pt-1"
      data-hub-tab-nav
    >
      <nav aria-label={ariaLabel} className="flex gap-1 overflow-x-auto overscroll-x-contain pb-0.5">
        {items.map((item) => (
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
    </div>
  )
}
