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
    <nav className="gerente-compact-nav flex flex-wrap gap-x-4 gap-y-1.5 text-[15px] font-medium" aria-label={m.gerente.titulo_painel}>
      {GERENTE_HEADER_NAV_ORDER.map((key) => {
        const href = painelGerencialHref(key)
        const ativo = linkAtivo(href, pathname)
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              'border-b-2 border-transparent pb-0.5 transition-colors',
              light ? 'app-muted hover:app-accent-text' : 'app-muted hover:app-accent-text',
              ativo && 'border-[color:var(--accent)] app-accent-text',
            )}
          >
            {gerenteNavLabel(m, key)}
          </Link>
        )
      })}
    </nav>
  )
}