'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ROUTES } from '@shared-core/navigation/routes'
import { cn } from '@/lib/utils'
import { hubTabIsActive, type HubTabDef } from '@/lib/navigation/hubNavModel'

type AdminHubTabNavProps = {
  tabs: readonly HubTabDef[]
  ariaLabel: string
}

export function AdminHubTabNav({ tabs, ariaLabel }: AdminHubTabNavProps) {
  const pathname = usePathname() ?? ''

  return (
    <nav
      aria-label={ariaLabel}
      className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border-secondary)] pb-2"
    >
      {tabs.map((tab) => {
        const active = hubTabIsActive(pathname, tab)
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
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
  )
}

type FinanceiroHubNavProps = {
  activeTab: 'receber' | 'pagar' | 'fiscal'
}

export function FinanceiroHubNav({ activeTab }: FinanceiroHubNavProps) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const onFinanceiro = pathname === ROUTES.admin.financeiro
  const onCategorias = pathname.startsWith(ROUTES.admin.categoriasFinanceiras)

  function hrefReceberPagarFiscal(tab: 'receber' | 'pagar' | 'fiscal'): string {
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', tab)
    return `${ROUTES.admin.financeiro}?${p.toString()}`
  }

  const items: Array<{ id: string; label: string; href: string; active: boolean }> = [
    {
      id: 'receber',
      label: 'A receber',
      href: hrefReceberPagarFiscal('receber'),
      active: onFinanceiro && activeTab === 'receber',
    },
    {
      id: 'pagar',
      label: 'A pagar',
      href: hrefReceberPagarFiscal('pagar'),
      active: onFinanceiro && activeTab === 'pagar',
    },
    {
      id: 'fiscal',
      label: 'Fila fiscal',
      href: hrefReceberPagarFiscal('fiscal'),
      active: onFinanceiro && activeTab === 'fiscal',
    },
    {
      id: 'categorias',
      label: 'Categorias',
      href: ROUTES.admin.categoriasFinanceiras,
      active: onCategorias,
    },
  ]

  return (
    <nav
      aria-label="Hub financeiro"
      className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border-secondary)] pb-2"
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
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
  )
}
