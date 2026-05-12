'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Mensagens } from '@/i18n/getMessages'
import { useGerenteUiTheme } from '@/components/gerente/GerenteThemeContext'
import { isGerenteLightChrome } from '@/components/gerente/gerenteUiTheme'
import {
  GERENTE_NAV_TOPICS,
  gerenteNavLabel,
  gerenteNavTopicIdForPathname,
  gerenteNavTopicLabel,
  painelGerencialHref,
  type PainelGerencialNavKey,
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
  const topicAtivoId = gerenteNavTopicIdForPathname(pathname)
  const topicAtivo = GERENTE_NAV_TOPICS.find((t) => t.id === topicAtivoId) ?? GERENTE_NAV_TOPICS[0]
  const mostrarSubNav = topicAtivo.items.length > 1

  const topicLinkClass = (topicId: typeof topicAtivoId) => {
    const ativo = topicId === topicAtivoId
    return cn(
      'whitespace-nowrap rounded-md border px-2.5 py-1 text-[13px] font-semibold transition-colors sm:text-[14px]',
      light ? 'app-muted hover:app-accent-text' : 'app-muted hover:app-accent-text',
      ativo
        ? 'border-[color:var(--accent)] app-accent-text bg-[color:var(--accent)]/10'
        : 'border-transparent hover:border-[color:var(--accent)]/35',
    )
  }

  const subLinkClass = (key: PainelGerencialNavKey) => {
    const href = painelGerencialHref(key)
    const ativo = linkAtivo(href, pathname)
    return cn(
      'whitespace-nowrap border-b-2 border-transparent pb-0.5 text-[13px] font-medium transition-colors sm:text-[14px]',
      light ? 'app-muted hover:app-accent-text' : 'app-muted hover:app-accent-text',
      ativo && 'border-[color:var(--accent)] app-accent-text',
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <nav
        className="gerente-compact-nav flex flex-wrap gap-x-2 gap-y-1.5"
        aria-label={m.gerente.titulo_painel}
      >
        {GERENTE_NAV_TOPICS.map((topic) => {
          const primeiro = topic.items[0]
          const href = painelGerencialHref(primeiro)
          return (
            <Link
              key={topic.id}
              href={href}
              className={topicLinkClass(topic.id)}
            >
              {gerenteNavTopicLabel(m, topic.id)}
            </Link>
          )
        })}
      </nav>

      {mostrarSubNav ? (
        <nav
          className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[color:var(--accent)]/20 pt-2"
          aria-label={m.gerente.nav_subsecoes_aria}
        >
          {topicAtivo.items.map((key) => {
            const href = painelGerencialHref(key)
            return (
              <Link
                key={key}
                href={href}
                className={subLinkClass(key)}
              >
                {gerenteNavLabel(m, key)}
              </Link>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
