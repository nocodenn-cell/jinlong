'use client'

import type { ElementType } from 'react'
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Package, Box, ShoppingCart, Coins, TrendingUp, Settings,
  Store, ChevronDown, LogOut, Bell,
} from 'lucide-react'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { PerfilUsuario } from '@/idioma/usuarioIdioma'
import {
  GERENTE_NAV_TOPICS,
  gerenteNavTopicLabel,
  gerenteNavTopicIdForPathname,
  painelGerencialHref,
  type GerenteNavTopicId,
} from '@/lib/navigation/painelGerencialNav'
import { GerenteTableDensityToggle } from '@/components/gerente/GerenteTableDensityToggle'
import LanguageToggle from '@/app/gerente/idioma/LanguageToggle'
import { cn } from '@/lib/utils'

// ─── types ────────────────────────────────────────────────────────────────────

export type SystemStatus = 'online' | 'degraded' | 'offline'

type Props = Readonly<{
  logoSubtitle: string
  perfil: PerfilUsuario
  m: Mensagens
  idioma: Idioma
  podeTrocarIdioma: boolean
  systemStatus?: SystemStatus
  notificationCount?: number
  onSignOut?: () => void | Promise<void>
}>

// ─── constants ────────────────────────────────────────────────────────────────

const TOPIC_ICONS: Record<GerenteNavTopicId, ElementType> = {
  inicio:            Home,
  catalogo:          Package,
  estoque_logistica: Box,
  vendas_caixa:      ShoppingCart,
  financeiro:        Coins,
  analise:           TrendingUp,
  sistema:           Settings,
}

const STATUS_CFG: Record<SystemStatus, { pill: string; dot: string; text: string; pulse: boolean }> = {
  online:   { pill: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400', dot: 'bg-emerald-500', text: 'Online',    pulse: true  },
  degraded: { pill: 'border-amber-500/25   bg-amber-500/[0.07]   text-amber-400',   dot: 'bg-amber-400',   text: 'Degradado', pulse: false },
  offline:  { pill: 'border-red-500/25     bg-red-500/[0.07]     text-red-400',      dot: 'bg-red-500',     text: 'Offline',   pulse: false },
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function roleLabel(perfil: PerfilUsuario, m: Mensagens): string {
  if (perfil === 'DONO') return m.gerente.badge_dono
  if (perfil === 'ADMIN') return m.gerente.badge_admin
  return m.gerente.badge_gerente
}

function roleInitials(perfil: PerfilUsuario): string {
  if (perfil === 'DONO') return 'DO'
  if (perfil === 'ADMIN') return 'AD'
  return 'GR'
}

// ─── component ────────────────────────────────────────────────────────────────

export function GerenteHeaderNav({
  logoSubtitle,
  perfil,
  m,
  idioma,
  podeTrocarIdioma,
  systemStatus = 'online',
  notificationCount = 0,
  onSignOut,
}: Props) {
  const pathname    = usePathname()
  const topicAtivo  = gerenteNavTopicIdForPathname(pathname)
  const status      = STATUS_CFG[systemStatus]
  const [ddOpen, setDdOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-30 w-full select-none print:hidden',
        'h-[52px] flex items-stretch',
        'bg-jl-surface-base border-b border-jl-border-1',
      )}
    >
      {/* ── ZONA A: IDENTIDADE ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 border-r border-jl-border-1 flex-shrink-0">
        <div className="w-[26px] h-[26px] rounded-[5px] flex items-center justify-center bg-amber-400/10 border border-amber-400/20 text-[9px] font-bold font-mono text-amber-400 tracking-tight">
          JL
        </div>
        <div className="h-3.5 w-px bg-jl-border-1 hidden sm:block" />
        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-jl-fg-3 hidden md:block whitespace-nowrap">
          {m.gerente.titulo_painel}
        </span>
      </div>

      {/* ── ZONA B: COMMAND TABS (desktop) ──────────────────────────────── */}
      <nav
        aria-label={m.gerente.titulo_painel}
        className="hidden lg:flex items-stretch flex-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {GERENTE_NAV_TOPICS.map((topic) => {
          const Icon     = TOPIC_ICONS[topic.id]
          const href     = painelGerencialHref(topic.items[0])
          const isActive = topicAtivo === topic.id
          return (
            <Link
              key={topic.id}
              href={href}
              className={cn(
                'group relative flex items-center gap-[5px] px-3',
                'text-[12px] font-medium whitespace-nowrap transition-colors duration-150',
                isActive
                  ? 'text-amber-400'
                  : 'text-jl-fg-2 hover:text-jl-fg-1 hover:bg-white/[0.025]',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="w-[14px] h-[14px] flex-shrink-0" />
              <span>{gerenteNavTopicLabel(m, topic.id)}</span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-400/70 rounded-t"
                  aria-hidden="true"
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── ZONA B: ÍCONES (mobile) ─────────────────────────────────────── */}
      <nav
        aria-label={m.gerente.titulo_painel}
        className="lg:hidden flex items-center gap-0.5 px-2 flex-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {GERENTE_NAV_TOPICS.map((topic) => {
          const Icon     = TOPIC_ICONS[topic.id]
          const href     = painelGerencialHref(topic.items[0])
          const isActive = topicAtivo === topic.id
          return (
            <Link
              key={topic.id}
              href={href}
              aria-label={gerenteNavTopicLabel(m, topic.id)}
              className={cn(
                'relative flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0 transition-colors duration-150',
                isActive
                  ? 'text-amber-400 bg-amber-400/10'
                  : 'text-jl-fg-2 hover:text-jl-fg-1 hover:bg-white/[0.04]',
              )}
            >
              <Icon className="w-4 h-4" />
            </Link>
          )
        })}
      </nav>

      {/* ── ZONA C: CONTEXTO OPERACIONAL ────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 border-l border-jl-border-1 flex-shrink-0">

        {/* Status operacional */}
        <div
          className={cn(
            'hidden sm:flex items-center gap-[5px] px-2 py-0.5 rounded-full',
            'border text-[10px] font-semibold font-mono tracking-[0.04em] uppercase',
            status.pill,
          )}
        >
          <span
            className={cn('w-[5px] h-[5px] rounded-full flex-shrink-0', status.dot, status.pulse && 'animate-pulse')}
            aria-hidden="true"
          />
          {status.text}
        </div>

        {/* Chip da loja */}
        <div className="hidden sm:flex items-center gap-[5px] px-2 py-[3px] rounded-[5px] border border-jl-border-1 bg-jl-surface-elev text-[11px] font-medium text-jl-fg-1 cursor-default max-w-[140px]">
          <Store className="w-3.5 h-3.5 text-jl-fg-3 flex-shrink-0" />
          <span className="truncate">{logoSubtitle}</span>
        </div>

        <div className="h-5 w-px bg-jl-border-1 hidden sm:block" />

        {/* Densidade da tabela */}
        <GerenteTableDensityToggle m={m} />

        {/* Idioma */}
        {podeTrocarIdioma && <LanguageToggle idiomaAtual={idioma} variant="dragon" />}

        {/* Notificações */}
        <button
          type="button"
          aria-label={notificationCount > 0 ? `Notificações — ${notificationCount} novas` : 'Notificações'}
          className="relative w-[30px] h-[30px] rounded-md flex items-center justify-center text-jl-fg-2 hover:text-jl-fg-1 hover:bg-white/[0.05] transition-colors"
        >
          <Bell className="w-[15px] h-[15px]" />
          {notificationCount > 0 && (
            <span className="absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full bg-red-500 border-[1.5px] border-jl-surface-base" aria-hidden="true" />
          )}
        </button>

        <div className="h-5 w-px bg-jl-border-1" />

        {/* Menu do usuário */}
        <div className="relative" ref={ddRef}>
          <button
            type="button"
            onClick={() => setDdOpen((v) => !v)}
            aria-expanded={ddOpen}
            aria-haspopup="menu"
            className={cn(
              'flex items-center gap-1.5 pl-1 pr-2 py-[3px] rounded-md transition-colors duration-150',
              ddOpen ? 'bg-white/[0.05]' : 'hover:bg-white/[0.04]',
            )}
          >
            <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center flex-shrink-0 bg-amber-400/10 border border-amber-400/20 text-[9px] font-bold font-mono text-amber-400">
              {roleInitials(perfil)}
            </div>
            <div className="hidden md:flex flex-col items-start leading-none gap-[2px]">
              <span className="text-[11.5px] font-semibold text-jl-fg-1 whitespace-nowrap">
                {roleLabel(perfil, m)}
              </span>
              <span className="text-[9px] font-mono tracking-[0.1em] uppercase text-jl-fg-3">
                {perfil}
              </span>
            </div>
            <ChevronDown
              className={cn('w-3 h-3 text-jl-fg-3 transition-transform duration-200', ddOpen && 'rotate-180')}
            />
          </button>

          {ddOpen && (
            <div
              role="menu"
              aria-label="Menu do usuário"
              className="absolute right-0 mt-1 w-48 z-[60] bg-jl-surface-elev border border-jl-border-1 rounded-lg overflow-hidden shadow-lg"
            >
              <div className="px-3 py-2.5 border-b border-jl-border-1">
                <p className="text-[12px] font-semibold text-jl-fg-1">{roleLabel(perfil, m)}</p>
                <p className="text-[10px] font-mono text-jl-fg-3 mt-[2px] uppercase tracking-widest">{perfil}</p>
              </div>
              <div className="py-1">
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => { setDdOpen(false); void onSignOut?.() }}
                  className="w-full flex items-center gap-2 px-3 py-[7px] text-[12px] text-left transition-colors duration-150 text-red-400/65 hover:text-red-400 hover:bg-red-500/[0.06]"
                >
                  <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{m.comum.sair}</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  )
}
