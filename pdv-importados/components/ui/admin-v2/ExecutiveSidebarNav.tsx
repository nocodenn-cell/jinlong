'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ADMIN_V2_DESTINATIONS,
  ADMIN_V2_INTERNO_ITEMS,
  ADMIN_V2_PDV_ITEM,
  modulosVisiveis,
  type AdminV2NavDestination,
  type AdminV2NavItem,
} from '@/lib/navigation/adminV2SidebarNav'
import { isAdminNavActive } from '@/lib/navigation/isAdminNavActive'
import { resolveNavLabels, type NavLabelsCtx } from '@/lib/navigation/resolveNavLabels'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'
import { StockAlertBadge } from '@/components/ui/StockAlertBadge'

export type ExecutiveSidebarNavProps = {
  admin: Mensagens['admin']
  chineseLanguage: boolean
  /** Observabilidade visual (flag `pdv_config.show_stock_alerts`): contagem de itens em estoque baixo. */
  stockAlertCount?: number
  /** Exibe itens `adminOnly` (grupo Interno: provisionamento, implantação, diagnóstico). */
  showAdminOnlyItems?: boolean
  /** Módulos com licença ativa para a empresa do usuário (resolvido no servidor). */
  modulosAtivos?: readonly string[]
}

const resolveLabels = resolveNavLabels

// Cores (hover/ativo) vêm só de `.admin-v2-nav-link` em styles/admin-v2.css (tokens
// `--admin-v2-active-*`) e o foco do anel global `a:focus-visible`; aqui fica só o layout.
const LINK_BASE =
  'admin-v2-nav-link flex items-center gap-3 rounded-lg border border-transparent px-3 py-2'

const matchesPath = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`)

function isItemActive(item: AdminV2NavItem, pathname: string, search: string): boolean {
  if ((item.notActivePaths ?? []).some((p) => matchesPath(pathname, p))) return false
  return (
    isAdminNavActive(pathname, search, item.href) ||
    (item.alsoActivePaths ?? []).some((p) => matchesPath(pathname, p))
  )
}

function NavItemLink({
  item,
  ctx,
  stockAlertCount,
  pathname,
  search,
  nested = false,
}: {
  item: AdminV2NavItem
  ctx: NavLabelsCtx
  stockAlertCount?: number
  pathname: string
  search: string
  nested?: boolean
}) {
  const badgeCount = item.id === 'estoque' ? stockAlertCount : undefined
  const active = isItemActive(item, pathname, search)
  const Icon = item.icon
  const { primary, secondary, hintText } = resolveLabels(item, ctx)

  return (
    <li>
      <Link
        href={item.href}
        title={`${primary}${secondary ? ` · ${secondary}` : ''}${hintText ? ` — ${hintText}` : ''}`}
        data-active={active}
        data-nav-id={item.id}
        aria-current={active ? 'page' : undefined}
        className={cn(LINK_BASE, nested && 'py-1.5 pl-3 text-[13px]')}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden /> : null}
        <div className="admin-v2-nav-label min-w-0 flex-1">
          <div className={cn('truncate font-medium leading-tight', nested ? 'text-[13px]' : 'text-sm')}>
            {primary}
          </div>
          {secondary ? <div className="truncate text-[11px] leading-tight text-jl-fg-3">{secondary}</div> : null}
        </div>
        {badgeCount != null ? <StockAlertBadge count={badgeCount} /> : null}
      </Link>
    </li>
  )
}

function DestinationGroup({
  destination,
  ctx,
  stockAlertCount,
  pathname,
  search,
}: {
  destination: AdminV2NavDestination
  ctx: NavLabelsCtx
  stockAlertCount?: number
  pathname: string
  search: string
}) {
  const children = destination.children ?? []
  // Grupo aberto = página do destino ou de qualquer sub-link está ativa. Sem estado local:
  // a URL é a fonte de verdade, então o menu nunca fica fora de sincronia com a tela.
  const open =
    children.length > 0 &&
    (isItemActive(destination, pathname, search) ||
      children.some((c) => isItemActive(c, pathname, search)))
  const linkProps = { ctx, stockAlertCount, pathname, search }

  return (
    <>
      <NavItemLink item={destination} {...linkProps} />
      {open ? (
        <li>
          <ul
            className="ml-5 flex flex-col gap-0.5 border-l border-[var(--admin-v2-border)] pl-2"
            data-nav-children-of={destination.id}
          >
            {children.map((child) => (
              <NavItemLink key={child.id} item={child} {...linkProps} nested />
            ))}
          </ul>
        </li>
      ) : null}
    </>
  )
}

/**
 * ExecutiveSidebarNav — Admin V2: "Abrir PDV" em destaque + 8 destinos pela jornada da loja
 * (sub-links só no grupo aberto) + grupo Interno (ADMIN).
 */
export function ExecutiveSidebarNav({
  admin,
  chineseLanguage,
  stockAlertCount,
  showAdminOnlyItems = false,
  modulosAtivos,
}: ExecutiveSidebarNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams?.toString() ?? ''
  const ctx: NavLabelsCtx = { admin, chineseLanguage }
  const internos = ADMIN_V2_INTERNO_ITEMS.filter((item) => !item.adminOnly || showAdminOnlyItems)
  const pdv = resolveLabels(ADMIN_V2_PDV_ITEM, ctx)
  const PdvIcon = ADMIN_V2_PDV_ITEM.icon
  const internoLabel = admin.nav.interno
  const internoText = chineseLanguage ? internoLabel.cn : internoLabel.pt
  const modulos = modulosVisiveis(modulosAtivos)
  const modulosText = chineseLanguage ? admin.nav.modulos.cn : admin.nav.modulos.pt

  return (
    <nav className="flex flex-col gap-4 p-3 lg:p-4" data-testid="executive-sidebar-nav">
      <Link
        href={ADMIN_V2_PDV_ITEM.href}
        data-nav-id={ADMIN_V2_PDV_ITEM.id}
        title={pdv.hintText ?? pdv.primary}
        aria-label={pdv.primary}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold',
          'bg-primary text-primary-foreground transition-opacity hover:opacity-90',
        )}
      >
        <PdvIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        <span className="admin-v2-nav-label truncate">{pdv.primary}</span>
      </Link>

      <ul className="flex flex-col gap-1">
        {ADMIN_V2_DESTINATIONS.map((destination) => (
          <DestinationGroup
            key={destination.id}
            destination={destination}
            ctx={ctx}
            stockAlertCount={stockAlertCount}
            pathname={pathname}
            search={search}
          />
        ))}
      </ul>

      {modulos.length > 0 ? (
        <div data-nav-group="modulos">
          <div className="admin-v2-nav-group-label mb-2 px-3">{modulosText}</div>
          <ul className="flex flex-col gap-1">
            {modulos.map((item) => (
              <NavItemLink key={item.id} item={item} ctx={ctx} pathname={pathname} search={search} />
            ))}
          </ul>
        </div>
      ) : null}

      {internos.length > 0 ? (
        <div data-nav-group="interno">
          <div className="admin-v2-nav-group-label mb-2 px-3">{internoText}</div>
          <ul className="flex flex-col gap-1">
            {internos.map((item) => (
              <NavItemLink key={item.id} item={item} ctx={ctx} pathname={pathname} search={search} />
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  )
}
