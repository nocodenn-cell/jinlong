'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  adminNavDictionaryKey,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'
import {
  ADMIN_V2_CORE_ITEMS,
  ADMIN_V2_EXPANDED_ITEMS,
  ADMIN_V2_SISTEMA_ITEMS,
  type AdminV2NavItem,
} from '@/lib/navigation/adminV2SidebarNav'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'

type SidebarNavProps = {
  admin: Mensagens['admin']
  chineseLanguage: boolean
}

function isRouteActive(pathname: string, href: string): boolean {
  if (href === '/gerente') return pathname === '/gerente' || pathname === '/gerente/'
  if (href.startsWith('/admin/')) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SidebarNav({ admin, chineseLanguage }: SidebarNavProps) {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)

  function renderItem(item: AdminV2NavItem) {
    if (item.type === 'route') {
      const dictKey = adminNavDictionaryKey(item.key)
      const line = admin.nav[dictKey]
      const hint = admin.navHints[dictKey]
      const href = painelGerencialHref(item.key)
      const active = isRouteActive(pathname, href)
      const Icon = item.icon
      const ptLabel = item.labelOverridePt ?? line?.pt ?? item.key
      const primary = chineseLanguage && line ? line.cn : ptLabel
      const secondary = chineseLanguage && line ? ptLabel : ''
      const hintText = hint ?? ''

      return (
        <li key={href}>
          <Link
            href={href}
            title={`${primary}${secondary ? ` · ${secondary}` : ''}${hintText ? ` — ${hintText}` : ''}`}
            data-active={active}
            className={cn(
              'admin-v2-nav-link flex items-center gap-3 rounded-full border border-transparent px-3 py-2.5',
              'data-[active=true]:border-[rgba(251,191,36,0.35)] data-[active=true]:bg-[rgba(251,191,36,0.1)] data-[active=true]:text-[#fbbf24]',
            )}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium leading-tight">{primary}</div>
              {secondary ? (
                <div className="truncate text-[11px] leading-tight text-jl-fg-3">{secondary}</div>
              ) : null}
            </div>
          </Link>
        </li>
      )
    }

    const active = isRouteActive(pathname, item.href)
    const Icon = item.icon
    const primary = chineseLanguage ? item.labelCn : item.labelPt
    const secondary = chineseLanguage ? item.labelPt : ''

    return (
      <li key={item.id}>
        <Link
          href={item.href}
          title={`${primary} — ${item.hint}`}
          data-active={active}
          className={cn(
            'admin-v2-nav-link flex items-center gap-3 rounded-full border border-transparent px-3 py-2.5',
            'data-[active=true]:border-[rgba(251,191,36,0.35)] data-[active=true]:bg-[rgba(251,191,36,0.1)] data-[active=true]:text-[#fbbf24]',
          )}
        >
          <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium leading-tight">{primary}</div>
            {secondary ? (
              <div className="truncate text-[11px] leading-tight text-jl-fg-3">{secondary}</div>
            ) : null}
          </div>
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
          className="admin-v2-nav-group-label mb-2 flex w-full items-center justify-between px-3 text-left transition-colors hover:text-jl-fg-2"
        >
          <span>Mais</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', showMore ? 'rotate-180' : 'rotate-0')}
            aria-hidden
          />
        </button>
        {showMore ? <ul className="flex flex-col gap-1">{ADMIN_V2_EXPANDED_ITEMS.map((item) => renderItem(item))}</ul> : null}
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
