'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { TabNav } from '@/components/ui/admin-v2'
import { FINANCEIRO_TABS as TABS, type FinanceiroTabId } from './financeiroTabs'

export type { FinanceiroTabId }

/** TabNav SSOT do hub Financeiro (RFC-UX-007). */
export function FinanceiroTabNav({ activeTab }: { activeTab: FinanceiroTabId }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const items = TABS.map((t) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', t.id)
    // Troca de aba limpa filtros da aba anterior (menos estado fantasma).
    if (t.id !== 'receber') {
      p.delete('q')
      p.delete('opcao')
      p.delete('cliente')
      p.delete('de')
      p.delete('ate')
      p.delete('limite')
    }
    if (t.id !== 'pagar') {
      p.delete('status')
      p.delete('periodo')
    }
    return {
      id: t.id,
      label: t.label,
      href: pathWithQuery(pathname || ROUTES.admin.financeiro, p),
    }
  })

  return <TabNav items={items} value={activeTab} aria-label="Abas financeiro" />
}
