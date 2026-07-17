'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'

export type FinanceiroTabId = 'receber' | 'pagar' | 'fiscal'

export function FinanceiroTabNav({ idioma, activeTab }: { idioma: Idioma; activeTab: FinanceiroTabId }) {
  const ui = getMessages(idioma).admin_ui
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tabs: ReadonlyArray<{ id: FinanceiroTabId; label: string }> = [
    { id: 'receber', label: ui.financeiro_tab_receber },
    { id: 'pagar', label: ui.financeiro_tab_pagar },
    { id: 'fiscal', label: ui.financeiro_tab_fiscal },
  ]

  function hrefFor(tab: FinanceiroTabId): string {
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', tab)
    return pathWithQuery(pathname || ROUTES.admin.financeiro, p)
  }

  return (
    <nav aria-label={ui.financeiro_tabs_aria_label} className="flex flex-wrap gap-1 border-b border-[var(--color-border-secondary)] pb-2">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={hrefFor(t.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            activeTab === t.id
              ? 'bg-jl-surface-elev text-jl-fg-1 shadow-sm'
              : 'text-jl-fg-3 hover:bg-jl-surface-soft hover:text-jl-fg-1',
          )}
          aria-current={activeTab === t.id ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

export function parseFinanceiroTab(raw: string | undefined): FinanceiroTabId {
  if (raw === 'pagar' || raw === 'fiscal') return raw
  return 'receber'
}
