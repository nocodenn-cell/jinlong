'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ADMIN_V2_CORE_ITEMS,
  ADMIN_V2_EXPANDED_ITEMS,
  ADMIN_V2_SISTEMA_ITEMS,
  type AdminV2NavItem,
} from '@/lib/navigation/adminV2SidebarNav'
import { ROUTES } from '@shared-core/navigation/routes'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'
import { StockAlertBadge } from '@/components/ui/StockAlertBadge'

type SidebarNavProps = {
  admin: Mensagens['admin']
  chineseLanguage: boolean
  /** Observabilidade visual (flag `pdv_config.show_stock_alerts`): contagem de itens em estoque baixo. */
  stockAlertCount?: number
}

function isRouteActive(pathname: string, href: string): boolean {
  if (href === ROUTES.gerente.home) {
    return pathname === ROUTES.gerente.home || pathname === `${ROUTES.gerente.home}/`
  }
  if (href.startsWith(`${ROUTES.admin.home}/`)) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SidebarNav({ admin, chineseLanguage, stockAlertCount }: SidebarNavProps) {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)

  function renderItem(item: AdminV2NavItem) {
    const badgeCount = item.id === 'estoque' ? stockAlertCount : undefined
    const dictKey = item.dictKey
    const line = dictKey ? admin.nav[dictKey as keyof typeof admin.nav] : undefined
    const hint = dictKey ? admin.navHints[dictKey as keyof typeof admin.navHints] : item.hint
    const href = item.href
    const active = isRouteActive(pathname, href)
    const Icon = item.icon
    const ptLabel = item.labelOverridePt ?? item.labelPt ?? line?.pt ?? item.id
    const primary = chineseLanguage && (line?.cn ?? item.labelCn) ? (line?.cn ?? item.labelCn) : ptLabel
    const secondary = chineseLanguage && line ? ptLabel : item.labelCn && chineseLanguage ? item.labelPt ?? '' : ''
    const hintText = hint ?? ''

    return (
      <li key={item.id}>
        <Link
          href={href}
          title={`${primary}${secondary ? ` · ${secondary}` : ''}${hintText ? ` — ${hintText}` : ''}`}
          data-active={active}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'admin-v2-nav-link flex items-center gap-3 rounded-full border border-transparent px-3 py-2.5',
            'data-[active=true]:border-[rgba(251,191,36,0.35)] data-[active=true]:bg-[rgba(251,191,36,0.1)] data-[active=true]:text-[var(--color-brand-primary)]',
          )}
        >
          <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight">{primary}</div>
            {secondary ? (
              <div className="truncate text-[11px] leading-tight text-jl-fg-3">{secondary}</div>
            ) : null}
          </div>
          {badgeCount != null ? <StockAlertBadge count={badgeCount} /> : null}
        </Link>
      </li>
    )
  }

  return (
    <nav className="flex flex-col gap-6 p-3 lg:p-4">
      <div>
        <div className="admin-v2-nav-group-label mb-2 px-3">CORE</div>
        <ul className="flex flex-col gap-1">{ADMIN_V2_CORE_ITEMS.map((item) => renderItem(item))}</ul>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowMore((current) => !current)}
          aria-expanded={showMore}
          aria-label={`Menu adicional ${showMore ? 'expandido' : 'recolhido'}`}
          aria-controls="nav-expanded-items"
          className="admin-v2-nav-group-label mb-2 flex w-full items-center justify-between px-3 text-left transition-colors hover:text-jl-fg-2"
        >
          <span>Mais</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', showMore ? 'rotate-180' : 'rotate-0')}
            aria-hidden
          />
        </button>
        {showMore ? (
          <ul id="nav-expanded-items" className="flex flex-col gap-1">
            {ADMIN_V2_EXPANDED_ITEMS.map((item) => renderItem(item))}
          </ul>
        ) : null}
      </div>

      <div>
        <div className="admin-v2-nav-group-label mb-2 px-3">SISTEMA</div>
        <ul className="flex flex-col gap-1">
          {ADMIN_V2_SISTEMA_ITEMS.map((item) => renderItem(item))}
        </ul>
      </div>
    </nav>
  )
}
