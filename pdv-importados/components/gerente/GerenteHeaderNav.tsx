'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Mensagens } from '@/i18n/getMessages'
import {
<<<<<<< HEAD
  GERENTE_MEGA_NAV_GROUPS,
  megaNavGroupIsActive,
  type MegaNavGroup,
} from '@/lib/navigation/gerenteMegaNavConfig'
=======
  GERENTE_NAV_TOPICS,
  gerenteNavLabel,
  gerenteNavTopicIdForPathname,
  gerenteNavTopicLabel,
  painelGerencialHref,
  type PainelGerencialNavKey,
} from '@/lib/navigation/painelGerencialNav'
>>>>>>> origin/main
import { cn } from '@/lib/utils'

function linkInicioAtivo(pathname: string | null): boolean {
  return pathname === '/gerente'
}

function MegaMenuPanel({
  group,
  m,
  onNavigate,
}: Readonly<{
  group: MegaNavGroup
  m: Mensagens
  onNavigate: () => void
}>) {
  const gridCols = group.columns.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'
  return (
    <div className="absolute left-0 top-full z-[60] max-w-[min(100vw-2rem,420px)] pt-1" role="presentation">
      <div
        className={cn(
          'dragon-glass-card grid gap-5 rounded-lg border app-border bg-[color:var(--color-background-surface)] p-4 shadow-lg',
          'grid-cols-1',
          gridCols,
        )}
        role="menu"
        aria-label={group.title(m)}
      >
        {group.columns.map((col, colIdx) => (
          <div key={`${group.id}-col-${colIdx}`}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide app-muted">{col.heading(m)}</p>
            <ul className="space-y-0.5">
              {col.items.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      role="menuitem"
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                        'app-muted hover:bg-[color:var(--color-background-surface-soft)] hover:app-accent-text',
                      )}
                      onClick={onNavigate}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      {item.label(m)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function useMegaNavState() {
  const [openId, setOpenId] = useState<string | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navRef = useRef<HTMLElement | null>(null)

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelScheduledClose()
    closeTimerRef.current = setTimeout(() => setOpenId(null), 140)
  }, [cancelScheduledClose])

  const open = useCallback(
    (id: string) => {
      cancelScheduledClose()
      setOpenId(id)
    },
    [cancelScheduledClose],
  )

  useEffect(() => {
    if (openId === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openId])

  useEffect(() => {
    if (openId === null) return
    const onDown = (e: MouseEvent) => {
      const root = navRef.current
      if (root && !root.contains(e.target as Node)) setOpenId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openId])

  return { openId, setOpenId, open, scheduleClose, cancelScheduledClose, navRef }
}

export function GerenteHeaderNav({ m }: Readonly<{ m: Mensagens }>) {
  const pathname = usePathname()
<<<<<<< HEAD
  const { openId, setOpenId, open, scheduleClose, cancelScheduledClose, navRef } = useMegaNavState()

  const triggerBase =
    'inline-flex items-center gap-0.5 border-b-2 border-transparent pb-0.5 text-[15px] font-medium transition-colors'
  const triggerIdle = 'app-muted hover:app-accent-text'
  const triggerOpen = 'border-[color:var(--accent)] app-accent-text'

  return (
    <nav
      ref={navRef}
      className="gerente-compact-nav flex flex-wrap items-center gap-x-4 gap-y-1.5"
      aria-label={m.gerente.titulo_painel}
    >
      <Link
        href="/gerente"
        className={cn(triggerBase, triggerIdle, linkInicioAtivo(pathname) && triggerOpen)}
      >
        {m.gerente.inicio}
      </Link>

      {GERENTE_MEGA_NAV_GROUPS.map((group) => {
        const ativo = megaNavGroupIsActive(group, pathname)
        const expanded = openId === group.id
        return (
          <div
            key={group.id}
            className="relative"
            onMouseEnter={() => open(group.id)}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              className={cn(triggerBase, triggerIdle, (expanded || ativo) && triggerOpen)}
              aria-expanded={expanded}
              aria-haspopup="menu"
              onClick={() => setOpenId(expanded ? null : group.id)}
              onFocus={() => cancelScheduledClose()}
            >
              {group.title(m)}
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded ? (
              <MegaMenuPanel group={group} m={m} onNavigate={() => setOpenId(null)} />
            ) : null}
          </div>
        )
      })}
    </nav>
=======
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
>>>>>>> origin/main
  )
}
