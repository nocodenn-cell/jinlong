'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { cn } from '@/lib/utils'

export type FinanceiroTabId = 'receber' | 'pagar' | 'fiscal'

const TABS: ReadonlyArray<{ id: FinanceiroTabId; label: string }> = [
  { id: 'receber', label: 'A receber' },
  { id: 'pagar', label: 'A pagar' },
  { id: 'fiscal', label: 'Fila fiscal' },
]

export function FinanceiroTabNav({ activeTab }: { activeTab: FinanceiroTabId }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function hrefFor(tab: FinanceiroTabId): string {
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', tab)
    return pathWithQuery(pathname || ROUTES.admin.financeiro, p)
  }

  return (
    <nav aria-label="Abas financeiro" className="flex flex-wrap gap-1 border-b border-[var(--color-border-secondary)] pb-2">
      {TABS.map((t) => (
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
