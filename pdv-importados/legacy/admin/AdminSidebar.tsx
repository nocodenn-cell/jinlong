'use client'

/** @deprecated Use SidebarNav from @/components/ui/admin-v2 instead. */
import Link from 'next/link'
import { adminNavDictionaryKey, painelGerencialHref } from '@/lib/navigation/painelGerencialNav'
import { ADMIN_SIDEBAR_NAV } from '@/lib/navigation/adminSidebarNav'
import type { Mensagens } from '@/i18n/getMessages'

type AdminSidebarProps = {
  admin: Mensagens['admin']
  chineseLanguage: boolean
  chineseThemeOn: boolean
}

function lineBoth(line: { pt: string; cn: string }): string {
  return `${line.cn} · ${line.pt}`
}

function navLabels(line: { pt: string; cn: string }, chineseLanguage: boolean): { primary: string; secondary: string } {
  if (!chineseLanguage) return { primary: line.pt, secondary: '' }
  return { primary: line.cn, secondary: line.pt }
}

export function AdminSidebar({ admin, chineseLanguage, chineseThemeOn }: AdminSidebarProps) {
  return (
    <aside
      className={
        chineseThemeOn
          ? 'relative w-full border-b border-[#3d3d3d] bg-[#2c2c2c] text-white lg:w-64 lg:border-b-0 lg:border-r'
          : 'relative w-full border-b border-slate-200 bg-white lg:w-56 lg:border-b-0 lg:border-r'
      }
    >
      <nav className="flex flex-wrap gap-1 p-3 lg:flex-col lg:gap-0.5">
        {ADMIN_SIDEBAR_NAV.map((item) => {
          const dictKey = adminNavDictionaryKey(item.key)
          const line = admin.nav[dictKey]
          const { primary, secondary } = navLabels(line, chineseLanguage)
          const hint = admin.navHints[dictKey]
          const label = chineseLanguage ? lineBoth(line) : line.pt
          const linkTitle = `${label} — ${hint}`
          const href = painelGerencialHref(item.key)
          const Icon = item.icon
          return (
            <Link
              key={href}
              href={href}
              title={linkTitle}
              className={
                chineseThemeOn
                  ? 'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#c42e2e] lg:px-4'
                  : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-800 transition-colors hover:bg-slate-100 lg:px-4'
              }
            >
              <Icon
                className={
                  chineseThemeOn
                    ? 'h-5 w-5 shrink-0 opacity-75 group-hover:opacity-100'
                    : 'h-5 w-5 shrink-0 text-slate-500'
                }
                strokeWidth={1.75}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">{primary}</div>
                {secondary ? (
                  <div
                    className={
                      chineseThemeOn
                        ? 'text-[11px] leading-tight text-white/55'
                        : 'text-[11px] leading-tight text-slate-500'
                    }
                  >
                    {secondary}
                  </div>
                ) : null}
              </div>
            </Link>
          )
        })}
      </nav>
      {chineseThemeOn ? (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/25 to-transparent lg:block"
          aria-hidden
        />
      ) : null}
    </aside>
  )
}