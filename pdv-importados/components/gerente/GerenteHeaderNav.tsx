'use client'

import type { ElementType } from 'react'
import { useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Package, Box, ShoppingCart, Coins, TrendingUp, Settings,
  ChevronDown, LogOut, Bell, AlertTriangle, Clock, Activity,
} from 'lucide-react'
import type { FilaStatusPayload } from '@/app/api/gerente/fila/status/route'
import type { HealthPayload } from '@/app/api/gerente/health/route'
import { useActivityFeed } from '@/lib/hooks/useActivityFeed'
import { usePolling } from '@/lib/hooks/usePolling'
import { ActivityRailDrawer } from '@/components/gerente/ActivityRailDrawer'
import { GerenteMobileNavDrawer } from '@/components/gerente/GerenteMobileNavDrawer'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { PerfilUsuario } from '@/idioma/usuarioIdioma'
import {
  GERENTE_NAV_TOPICS,
  gerenteNavLabel,
  gerenteNavTopicLabel,
  gerenteNavTopicIdForPathname,
  painelGerencialHref,
  type GerenteNavTopicId,
} from '@/lib/navigation/painelGerencialNav'
import LanguageToggle from '@/app/gerente/idioma/LanguageToggle'
import { cn } from '@/lib/utils'

// ─── types ────────────────────────────────────────────────────────────────────

type SystemStatus = 'online' | 'attention' | 'degraded' | 'offline'

type Props = Readonly<{
  logoSubtitle: string
  perfil: PerfilUsuario
  m: Mensagens
  idioma: Idioma
  podeTrocarIdioma: boolean
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

const STATUS_CFG: Record<SystemStatus, {
  dot: string
  textCn: string
  pulse: boolean
}> = {
  online:    { dot: 'bg-emerald-500', textCn: 'text-emerald-400', pulse: false },
  attention: { dot: 'bg-amber-400',   textCn: 'text-amber-300',   pulse: false },
  degraded:  { dot: 'bg-amber-400',   textCn: 'text-amber-400',   pulse: false },
  offline:   { dot: 'bg-red-500',     textCn: 'text-red-400',     pulse: false },
}

function buildStatusLine(
  sysStatus: SystemStatus,
  fiscalErro: number,
  fiscalFila: number,
  relTime: string,
  latency: number | null,
): { primary: string; secondary: string } {
  if (sysStatus === 'offline')   return { primary: 'Offline',   secondary: '' }
  if (sysStatus === 'degraded')  return { primary: 'Degradado', secondary: relTime }

  if (fiscalErro > 0) {
    return { primary: `${fiscalErro} erro${fiscalErro > 1 ? 's' : ''} fiscal`, secondary: relTime }
  }
  if (fiscalFila > 0) {
    return { primary: `Fila: ${fiscalFila}`, secondary: relTime }
  }
  const lat = latency !== null ? `${latency}ms` : ''
  return { primary: '0 pendências', secondary: [relTime, lat].filter(Boolean).join(' · ') }
}

const HEALTH_INTERVAL_MS = 60_000
const NOTIF_INTERVAL_MS  = 5 * 60_000
const FILA_INTERVAL_MS   = 60_000
const TICK_INTERVAL_MS   = 10_000

const FILA_ZERO: FilaStatusPayload = { fiscal: { pendente: 0, erro: 0 }, aprovacoes: 0 }

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

function linkAtivo(href: string, pathname: string | null): boolean {
  if (!pathname) return false
  if (href === '/gerente') return pathname === '/gerente'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function relativeTimeShort(date: Date | null): string {
  if (!date) return '...'
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 10) return 'agora'
  if (diff < 60) return `há ${diff}s`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `há ${mins}min`
  return `há ${Math.floor(mins / 60)}h`
}

// ─── component ────────────────────────────────────────────────────────────────

export function GerenteHeaderNav({
  logoSubtitle,
  perfil,
  m,
  idioma,
  podeTrocarIdioma,
  onSignOut,
}: Props) {
  const pathname   = usePathname()
  const topicAtivo = gerenteNavTopicIdForPathname(pathname)

  // ── sistema: status + latência + timestamp + fiscal ─────────────────────
  const [sysStatus,    setSysStatus]    = useState<SystemStatus>('online')
  const [latency,      setLatency]      = useState<number | null>(null)
  const [lastCheckAt,  setLastCheckAt]  = useState<Date | null>(null)
  const [fiscalErro,   setFiscalErro]   = useState(0)
  const [fiscalFila,   setFiscalFila]   = useState(0)
  const [tick,         setTick]         = useState(0)

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/gerente/health')
      if (!res.ok) { setSysStatus('degraded'); return false }
      const data = (await res.json()) as HealthPayload
      const base = data.status ?? 'online'
      const hasErro = (data.fiscal_erro ?? 0) > 0
      setSysStatus(base === 'online' && hasErro ? 'attention' : base)
      if (typeof data.latency === 'number') setLatency(data.latency)
      setFiscalErro(data.fiscal_erro ?? 0)
      setFiscalFila(data.fiscal_fila ?? 0)
      setLastCheckAt(new Date())
      return true
    } catch {
      setSysStatus('offline')
      return false // backoff via usePolling
    }
  }, [])

  usePolling(checkHealth, HEALTH_INTERVAL_MS)

  // tick para atualizar tempo relativo a cada 10s
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), TICK_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  // ── fila operacional (fiscal + aprovações) ───────────────────────────────
  const [filaStatus, setFilaStatus] = useState<FilaStatusPayload>(FILA_ZERO)

  const fetchFilaStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/gerente/fila/status')
      if (!res.ok) return false
      const data = (await res.json()) as FilaStatusPayload
      setFilaStatus(data)
      return true
    } catch {
      return false // backoff via usePolling
    }
  }, [])

  usePolling(fetchFilaStatus, FILA_INTERVAL_MS)

  // ── notificações ─────────────────────────────────────────────────────────
  const [notifCount, setNotifCount] = useState(0)

  const fetchNotifCount = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/gerente/notificacoes/count')
      if (!res.ok) return false
      const data = (await res.json()) as { count: number }
      setNotifCount(data.count ?? 0)
      return true
    } catch {
      return false // backoff via usePolling
    }
  }, [])

  usePolling(fetchNotifCount, NOTIF_INTERVAL_MS)

  // ── topic dropdown ───────────────────────────────────────────────────────
  const [openTopic, setOpenTopic] = useState<GerenteNavTopicId | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openDropdown = (id: GerenteNavTopicId) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenTopic(id)
  }
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpenTopic(null), 120)
  }
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  // ── activity rail ─────────────────────────────────────────────────────────
  const [railOpen, setRailOpen] = useState(false)
  const { items: activityItems, newCount: activityNew, isLoading: activityLoading, markSeen } = useActivityFeed()

  const openRail = () => {
    setRailOpen(true)
    markSeen()
  }

  // ── user dropdown ────────────────────────────────────────────────────────
  const [ddOpen, setDdOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const status       = STATUS_CFG[sysStatus]
  const relTime      = relativeTimeShort(lastCheckAt)
  const statusLine   = buildStatusLine(sysStatus, fiscalErro, fiscalFila, relTime, latency)
  void tick          // garante re-render periódico para relTime

  return (
    <>
    <header
      className={cn(
        'sticky top-0 z-30 w-full select-none print:hidden',
        'h-[60px] flex items-stretch',
        'bg-jl-surface-base border-b border-jl-border-1',
      )}
    >
      {/* #33: hamburger + drawer de navegação (só < md) */}
      <GerenteMobileNavDrawer m={m} userLabel={roleLabel(perfil, m)} onSignOut={onSignOut} />

      {/* ── ZONA A: IDENTIDADE + LOJA ───────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 border-r border-jl-border-1 flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/brand-double-dragon.png"
          alt="Jīn Lóng"
          className="h-7 w-auto flex-shrink-0"
        />
        <div className="hidden sm:flex flex-col justify-center gap-[3px] min-w-0">
          <span className="text-[12px] font-semibold leading-none text-jl-fg-1 truncate max-w-[160px]">
            {logoSubtitle}
          </span>
          <span className="text-[9px] font-mono tracking-[0.07em] uppercase leading-none text-jl-fg-3">
            FastProduct
          </span>
        </div>
      </div>

      {/* ── ZONA B: COMMAND TABS (desktop) ──────────────────────────────── */}
      <nav
        aria-label={m.gerente.titulo_painel}
        className="hidden lg:flex items-stretch flex-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {GERENTE_NAV_TOPICS.map((topic) => {
          const Icon        = TOPIC_ICONS[topic.id]
          const href        = painelGerencialHref(topic.items[0])
          const isActive    = topicAtivo === topic.id
          const hasChildren = topic.items.length > 1
          const isOpen      = openTopic === topic.id

          return (
            <div
              key={topic.id}
              className="relative flex items-stretch"
              onMouseEnter={() => hasChildren && openDropdown(topic.id)}
              onMouseLeave={scheduleClose}
            >
              <Link
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
                {hasChildren && (
                  <ChevronDown
                    className={cn(
                      'w-2.5 h-2.5 opacity-40 flex-shrink-0 transition-transform duration-150',
                      isOpen && 'rotate-180 opacity-70',
                    )}
                  />
                )}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-400/70 rounded-t"
                    aria-hidden="true"
                  />
                )}
              </Link>

              {/* sub-nav dropdown */}
              {hasChildren && isOpen && (
                <div
                  className={cn(
                    'absolute top-full left-0 z-[50] min-w-[11rem]',
                    'dragon-elev-2 rounded-b-lg overflow-hidden py-1',
                  )}
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                >
                  {topic.items.map((key) => {
                    const subHref   = painelGerencialHref(key)
                    const subActive = linkAtivo(subHref, pathname)
                    return (
                      <Link
                        key={key}
                        href={subHref}
                        onClick={() => setOpenTopic(null)}
                        className={cn(
                          'flex items-center px-3 py-[7px] text-[12px] transition-colors duration-100',
                          subActive
                            ? 'text-amber-400 bg-amber-400/[0.06]'
                            : 'text-jl-fg-2 hover:text-jl-fg-1 hover:bg-white/[0.05]',
                        )}
                      >
                        {gerenteNavLabel(m, key)}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── ZONA B: ÍCONES (tablet md→lg; < md vira o drawer #33) ───────── */}
      <nav
        aria-label={m.gerente.titulo_painel}
        className="hidden md:flex lg:hidden items-center gap-0.5 px-2 flex-1 overflow-x-auto"
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
      <div className="flex items-center gap-2 px-3 border-l border-jl-border-1 flex-shrink-0">

        {/* Bloco de status operacional */}
        <button
          type="button"
          onClick={() => void checkHealth()}
          title="Verificar status do sistema"
          className="hidden md:flex flex-col justify-center gap-[3px] px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer min-w-[88px]"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-[5px] h-[5px] rounded-full flex-shrink-0',
                status.dot,
                status.pulse && 'animate-pulse',
              )}
              aria-hidden="true"
            />
            <span className={cn('text-[11px] font-semibold leading-none', status.textCn)}>
              {statusLine.primary}
            </span>
          </div>
          {statusLine.secondary && (
            <span className="font-mono leading-none text-[9px] text-jl-fg-3">
              {statusLine.secondary}
            </span>
          )}
        </button>

        {/* Status dot compacto — só mobile */}
        <button
          type="button"
          onClick={() => void checkHealth()}
          aria-label={`Sistema ${statusLine.primary.toLowerCase()}`}
          className="md:hidden flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/[0.04] transition-colors"
        >
          <span
            className={cn('w-[6px] h-[6px] rounded-full', status.dot, status.pulse && 'animate-pulse')}
            aria-hidden="true"
          />
        </button>

        {/* Fila fiscal — só aparece quando há pendências */}
        {(filaStatus.fiscal.pendente > 0 || filaStatus.fiscal.erro > 0) && (
          <Link
            href="/gerente/financeiro"
            title={
              filaStatus.fiscal.erro > 0
                ? `${filaStatus.fiscal.erro} erro(s) fiscal(is)`
                : `${filaStatus.fiscal.pendente} documento(s) pendente(s)`
            }
            className={cn(
              'hidden sm:inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold tabular-nums transition-colors',
              filaStatus.fiscal.erro > 0
                ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20'
                : 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20',
            )}
          >
            <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" aria-hidden />
            {filaStatus.fiscal.erro > 0
              ? `${filaStatus.fiscal.erro} fiscal`
              : `${filaStatus.fiscal.pendente} fila`}
          </Link>
        )}

        {/* Aprovações pendentes — só aparece quando há */}
        {filaStatus.aprovacoes > 0 && (
          <Link
            href="/gerente/financeiro"
            title={`${filaStatus.aprovacoes} movimentação(ões) aguardando aprovação`}
            className="hidden sm:inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-semibold tabular-nums text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            <Clock className="h-2.5 w-2.5 flex-shrink-0" aria-hidden />
            {filaStatus.aprovacoes} aprov.
          </Link>
        )}

        {/* Activity Rail trigger */}
        <button
          type="button"
          onClick={openRail}
          aria-label={activityNew > 0 ? `${activityNew} nova(s) atividade(s)` : 'Atividades recentes'}
          className="relative w-[30px] h-[30px] rounded-md flex items-center justify-center text-jl-fg-2 hover:text-jl-fg-1 hover:bg-white/[0.05] transition-colors"
        >
          <Activity className="w-[15px] h-[15px]" />
          {activityNew > 0 && (
            <span
              className="absolute top-[5px] right-[5px] min-w-[5px] h-[5px] rounded-full bg-amber-400 border-[1.5px] border-jl-surface-base"
              aria-hidden="true"
            />
          )}
        </button>

        {/* Idioma */}
        {podeTrocarIdioma && <LanguageToggle idiomaAtual={idioma} variant="dragon" />}

        {/* Notificações */}
        <button
          type="button"
          onClick={() => void fetchNotifCount()}
          aria-label={notifCount > 0 ? `${notifCount} produtos com estoque crítico` : 'Notificações'}
          className="relative w-[30px] h-[30px] rounded-md flex items-center justify-center text-jl-fg-2 hover:text-jl-fg-1 hover:bg-white/[0.05] transition-colors"
        >
          <Bell className="w-[15px] h-[15px]" />
          {notifCount > 0 && (
            <span
              className="absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full bg-red-500 border-[1.5px] border-jl-surface-base"
              aria-hidden="true"
            />
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
              className="absolute right-0 mt-1 w-48 z-[60] dragon-elev-2 rounded-lg overflow-hidden"
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

    <ActivityRailDrawer
      open={railOpen}
      onClose={() => setRailOpen(false)}
      items={activityItems}
      isLoading={activityLoading}
    />
  </>
  )
}
