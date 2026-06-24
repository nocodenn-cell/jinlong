'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ADMIN_V2_MAIN_ITEMS,
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

function NavItem({
  item,
  admin,
  chineseLanguage,
  stockAlertCount,
  pathname,
}: {
  item: AdminV2NavItem
  admin: Mensagens['admin']
  chineseLanguage: boolean
  stockAlertCount?: number
  pathname: string
}) {
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
    <li>
      <Link
        href={href}
        title={`${primary}${secondary ? ` · ${secondary}` : ''}${hintText ? ` — ${hintText}` : ''}`}
        data-active={active}
        className={cn(
          'admin-v2-nav-link flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2',
          active
            ? 'border-l-[var(--admin-v2-nav-active-indicator)] bg-[var(--admin-v2-active-bg)] text-[var(--admin-v2-active-text)]'
            : 'text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-nav-hover-bg)] hover:text-[var(--admin-v2-text-primary)]',
        )}
      >
        <Icon
          className={cn('h-4 w-4 shrink-0', active ? 'opacity-90' : 'opacity-60')}
          strokeWidth={active ? 2 : 1.75}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{primary}</div>
          {secondary ? (
            <div className="truncate text-[11px] leading-tight text-jl-fg-3">{secondary}</div>
          ) : null}
        </div>
        {badgeCount != null ? <StockAlertBadge count={badgeCount} /> : null}
      </Link>
    </li>
  )
}

export function SidebarNav({ admin, chineseLanguage, stockAlertCount }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 overflow-y-auto px-3 py-4 lg:px-3">
      {/* MÓDULOS OPERACIONAIS — todos visíveis, ordenados como no Bling */}
      <div className="mb-1">
        <p className="admin-v2-nav-group-label mb-1.5 px-3">MÓDULOS</p>
        <ul className="flex flex-col gap-0.5">
          {ADMIN_V2_MAIN_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              admin={admin}
              chineseLanguage={chineseLanguage}
              stockAlertCount={stockAlertCount}
              pathname={pathname}
            />
          ))}
        </ul>
      </div>

      <div className="my-2 border-t border-[var(--admin-v2-border)]" aria-hidden />

      {/* SISTEMA — auditoria, comissões, configurações, PDV */}
      <div>
        <p className="admin-v2-nav-group-label mb-1.5 px-3">SISTEMA</p>
        <ul className="flex flex-col gap-0.5">
          {ADMIN_V2_SISTEMA_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              admin={admin}
              chineseLanguage={chineseLanguage}
              stockAlertCount={stockAlertCount}
              pathname={pathname}
            />
          ))}
        </ul>
      </div>
    </nav>
  )
}
