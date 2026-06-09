'use client'

import React, { useEffect, useState, type ElementType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, X, LogOut,
  Home, Package, Box, ShoppingCart, Coins, TrendingUp, Settings,
} from 'lucide-react'
import {
  GERENTE_NAV_HREF,
  GERENTE_NAV_TOPICS,
  gerenteNavLabel,
  gerenteNavTopicLabel,
  gerenteNavTopicIdForPathname,
  type GerenteNavTopicId,
} from '@/lib/navigation/gerenteNavUi'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'

const TOPIC_ICONS: Record<GerenteNavTopicId, ElementType> = {
  inicio: Home,
  catalogo: Package,
  estoque_logistica: Box,
  vendas_caixa: ShoppingCart,
  financeiro: Coins,
  analise: TrendingUp,
  sistema: Settings,
}

type Props = Readonly<{
  m: Mensagens
  /** Rótulo do usuário (papel/nome) exibido no rodapé do drawer. */
  userLabel: string
  onSignOut?: () => void | Promise<void>
}>

function hrefAtivo(href: string, pathname: string | null): boolean {
  if (!pathname) return false
  if (href === '/gerente') return pathname === '/gerente'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * #33 — Navegação mobile do gerente. Abaixo de `md` a top-bar horizontal não
 * cabe; um hamburger abre um drawer lateral com a mesma nav em vertical, brand
 * no topo e usuário/sair no rodapé. Padrão pronto p/ portar a outros painéis.
 * Só existe < md (o hamburger é `md:hidden`); de `md` p/ cima a nav da top-bar
 * assume.
 */
export function GerenteMobileNavDrawer({ m, userLabel, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const topicAtivo = gerenteNavTopicIdForPathname(pathname)

  // Escape + trava de scroll enquanto aberto.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  // Fecha ao navegar (mudança de rota).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={m.gerente.titulo_painel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="md:hidden my-auto ml-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-jl-fg-2 transition-colors hover:bg-white/[0.05] hover:text-jl-fg-1"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label={m.gerente.titulo_painel}>
          <div className="dragon-glass-backdrop absolute inset-0" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-[20rem] flex-col bg-jl-surface-base shadow-xl">
            {/* Brand no topo + fechar */}
            <div className="flex items-center justify-between gap-2 border-b border-jl-border-1 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/branding/brand-double-dragon.png" alt="" className="h-7 w-auto flex-shrink-0" />
                <span className="logo-wordmark-main truncate text-base font-semibold">金龍 Jīn Lóng</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={m.comum.fechar ?? 'Fechar'}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-jl-fg-3 transition-colors hover:bg-white/[0.06] hover:text-jl-fg-1"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Nav vertical */}
            <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={m.gerente.titulo_painel}>
              {GERENTE_NAV_TOPICS.map((topic) => {
                const Icon = TOPIC_ICONS[topic.id]
                const unico = topic.items.length === 1

                if (unico) {
                  const href = GERENTE_NAV_HREF[topic.items[0]]
                  const ativo = topicAtivo === topic.id || hrefAtivo(href, pathname)
                  return (
                    <Link
                      key={topic.id}
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={ativo ? 'page' : undefined}
                      className={cn(
                        'mb-1 flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        ativo ? 'bg-amber-400/10 text-amber-400' : 'text-jl-fg-2 hover:bg-white/[0.04] hover:text-jl-fg-1',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
                      {gerenteNavTopicLabel(m, topic.id)}
                    </Link>
                  )
                }

                return (
                  <div key={topic.id} className="mb-2">
                    <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-jl-fg-3">
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                      {gerenteNavTopicLabel(m, topic.id)}
                    </div>
                    <div className="mt-0.5">
                      {topic.items.map((key) => {
                        const href = GERENTE_NAV_HREF[key]
                        const ativo = hrefAtivo(href, pathname)
                        return (
                          <Link
                            key={key}
                            href={href}
                            onClick={() => setOpen(false)}
                            aria-current={ativo ? 'page' : undefined}
                            className={cn(
                              'ml-1.5 block rounded-md px-3 py-2 text-sm transition-colors',
                              ativo ? 'bg-amber-400/10 font-medium text-amber-400' : 'text-jl-fg-2 hover:bg-white/[0.04] hover:text-jl-fg-1',
                            )}
                          >
                            {gerenteNavLabel(m, key)}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>

            {/* Usuário + sair no rodapé */}
            <div className="border-t border-jl-border-1 px-3 py-3">
              <p className="px-1 pb-2 text-[12px] font-semibold text-jl-fg-1">{userLabel}</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  void onSignOut?.()
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-jl-fg-2 transition-colors hover:bg-white/[0.04] hover:text-jl-fg-1"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden />
                {m.comum.sair}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
