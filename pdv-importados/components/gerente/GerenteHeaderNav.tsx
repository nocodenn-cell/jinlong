'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Mensagens } from '@/i18n/getMessages'
import { useGerenteUiTheme } from '@/components/gerente/GerenteThemeContext'
import { isGerenteLightChrome } from '@/components/gerente/gerenteUiTheme'
import {
  GERENTE_HEADER_NAV_ORDER,
  gerenteNavLabel,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'
import { cn } from '@/lib/utils'

function linkAtivo(href: string, pathname: string | null): boolean {
  if (!pathname) return false
  if (href === '/gerente') return pathname === '/gerente'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function GerenteHeaderNav({ m }: Readonly<{ m: Mensagens }>) {
  const pathname = usePathname()
  const { theme } = useGerenteUiTheme()
  const light = isGerenteLightChrome(theme)

  return (
    <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium" aria-label={m.gerente.titulo_painel}>
      {GERENTE_HEADER_NAV_ORDER.map((key) => {
        const href = painelGerencialHref(key)
        const ativo = linkAtivo(href, pathname)
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              'border-b-2 border-transparent pb-1 transition-colors',
              light
                ? 'text-slate-600 hover:text-amber-700'
                : 'text-slate-300 hover:text-amber-400',
              ativo && (light ? 'border-amber-600 text-amber-800' : 'border-amber-500 text-amber-400'),
            )}
          >
            {gerenteNavLabel(m, key)}
          </Link>
        )
      })}
    </nav>
  )
}