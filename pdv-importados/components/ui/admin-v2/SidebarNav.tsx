'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  adminNavDictionaryKey,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'
import { ADMIN_V2_SIDEBAR_GROUPS } from '@/lib/navigation/adminV2SidebarNav'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'

type SidebarNavProps = {
  admin: Mensagens['admin']
  chineseLanguage: boolean
}

function navLabels(
  line: { pt: string; cn: string },
  chineseLanguage: boolean,
): { primary: string; secondary: string } {
  if (!chineseLanguage) return { primary: line.pt, secondary: '' }
  return { primary: line.cn, secondary: line.pt }
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

  return (
    <nav className="flex flex-col gap-6 p-3 lg:p-4">
      {ADMIN_V2_SIDEBAR_GROUPS.map((group) => (
        <div key={group.id}>
          <div className="admin-v2-nav-group-label mb-2 px-3">
            {chineseLanguage ? group.labelCn : group.labelPt}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              if (item.type === 'route') {
                const dictKey = adminNavDictionaryKey(item.key)
                const line = admin.nav[dictKey]
                const hint = admin.navHints[dictKey]
                const { primary, secondary } = navLabels(line, chineseLanguage)
                const href = painelGerencialHref(item.key)
                const active = isRouteActive(pathname, href)
                const Icon = item.icon

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={`${primary}${secondary ? ` · ${secondary}` : ''} — ${hint}`}
                      data-active={active}
                      className={cn(
                        'admin-v2-nav-link flex items-center gap-3 rounded-r-md px-3 py-2.5',
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
                      'admin-v2-nav-link flex items-center gap-3 rounded-r-md px-3 py-2.5',
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
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
