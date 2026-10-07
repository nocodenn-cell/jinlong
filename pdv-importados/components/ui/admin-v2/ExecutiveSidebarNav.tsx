'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ADMIN_V2_ANALISES_ITEMS,
  ADMIN_V2_OPERACOES_ITEMS,
  ADMIN_V2_SISTEMA_ITEMS,
  type AdminV2NavItem,
} from '@/lib/navigation/adminV2SidebarNav'
import { isAdminNavActive } from '@/lib/navigation/isAdminNavActive'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'
import { StockAlertBadge } from '@/components/ui/StockAlertBadge'

export type ExecutiveSidebarNavProps = {
  admin: Mensagens['admin']
  chineseLanguage: boolean
  /** Observabilidade visual (flag `pdv_config.show_stock_alerts`): contagem de itens em estoque baixo. */
  stockAlertCount?: number
  /** Exibe itens `adminOnly` (wizard de provisionamento, etc.). */
  showAdminOnlyItems?: boolean
  /** Controla expansão inicial da seção Operações (default: aberta). */
  operacoesDefaultOpen?: boolean
}

function resolveLabels(
  item: AdminV2NavItem,
  admin: Mensagens['admin'],
  chineseLanguage: boolean,
): { primary: string; secondary: string; hintText: string } {
  const dictKey = item.dictKey
  const line = dictKey ? admin.nav[dictKey as keyof typeof admin.nav] : undefined
  const hint = dictKey ? admin.navHints[dictKey as keyof typeof admin.navHints] : item.hint
  const ptLabel = item.labelOverridePt ?? item.labelPt ?? line?.pt ?? item.id
  const primary = chineseLanguage && (line?.cn ?? item.labelCn) ? (line?.cn ?? item.labelCn)! : ptLabel
  const secondary =
    chineseLanguage && line ? ptLabel : item.labelCn && chineseLanguage ? (item.labelPt ?? '') : ''
  return { primary, secondary, hintText: hint ?? item.hint ?? '' }
}

function NavItemLink({
  item,
  admin,
  chineseLanguage,
  stockAlertCount,
  pathname,
  search,
}: {
  item: AdminV2NavItem
  admin: Mensagens['admin']
  chineseLanguage: boolean
  stockAlertCount?: number
  pathname: string
  search: string
}) {
  const badgeCount = item.id === 'estoque' ? stockAlertCount : undefined
  const active = isAdminNavActive(pathname, search, item.href)
  const Icon = item.icon
  const { primary, secondary, hintText } = resolveLabels(item, admin, chineseLanguage)

  return (
    <li>
      <Link
        href={item.href}
        title={`${primary}${secondary ? ` · ${secondary}` : ''}${hintText ? ` — ${hintText}` : ''}`}
        data-active={active}
        data-nav-id={item.id}
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

/**
 * ExecutiveSidebarNav — navegação Admin V2 com ANÁLISES (5 abas) + OPERAÇÕES + SISTEMA.
 */
export function ExecutiveSidebarNav({
  admin,
  chineseLanguage,
  stockAlertCount,
  showAdminOnlyItems = false,
  operacoesDefaultOpen = true,
}: ExecutiveSidebarNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams?.toString() ?? ''
  const [opsOpen, setOpsOpen] = useState(operacoesDefaultOpen)
  const sistemaItems = ADMIN_V2_SISTEMA_ITEMS.filter(
    (item) => !item.adminOnly || showAdminOnlyItems,
  )

  const linkProps = { admin, chineseLanguage, stockAlertCount, pathname, search }

  return (
    <nav className="flex flex-col gap-6 p-3 lg:p-4" data-testid="executive-sidebar-nav">
      <div>
        <div className="admin-v2-nav-group-label mb-2 px-3">Análises</div>
        <ul className="flex flex-col gap-1">
          {ADMIN_V2_ANALISES_ITEMS.map((item) => (
            <NavItemLink key={item.id} item={item} {...linkProps} />
          ))}
        </ul>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setOpsOpen((current) => !current)}
          aria-expanded={opsOpen}
          aria-label={`Operações ${opsOpen ? 'expandido' : 'recolhido'}`}
          aria-controls="nav-operacoes-items"
          className="admin-v2-nav-group-label mb-2 flex w-full items-center justify-between px-3 text-left transition-colors hover:text-jl-fg-2"
        >
          <span>Operações</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', opsOpen ? 'rotate-180' : 'rotate-0')}
            aria-hidden
          />
        </button>
        {opsOpen ? (
          <ul id="nav-operacoes-items" className="flex flex-col gap-1">
            {ADMIN_V2_OPERACOES_ITEMS.map((item) => (
              <NavItemLink key={item.id} item={item} {...linkProps} />
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <div className="admin-v2-nav-group-label mb-2 px-3">Sistema</div>
        <ul className="flex flex-col gap-1">
          {sistemaItems.map((item) => (
            <NavItemLink key={item.id} item={item} {...linkProps} />
          ))}
        </ul>
      </div>
    </nav>
  )
}
