'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, Receipt, Wallet, FileCheck, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AtividadeRailItem } from '@/lib/hooks/useActivityFeed'

type Props = Readonly<{
  open: boolean
  onClose: () => void
  items: AtividadeRailItem[]
  isLoading: boolean
}>

const TIPO_ICON = {
  VENDA:       Receipt,
  CAIXA:       Wallet,
  FISCAL_OK:   FileCheck,
  FISCAL_ERRO: AlertCircle,
} as const

const TIPO_ICON_CN = {
  VENDA:       'text-emerald-400',
  CAIXA:       'text-sky-400',
  FISCAL_OK:   'text-amber-400',
  FISCAL_ERRO: 'text-red-400',
} as const

const SEVERITY_ACCENT = {
  info:    '',
  warning: 'border-l-2 border-amber-400/60',
  error:   'border-l-2 border-red-500/70',
} as const

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)  return `${diff}s`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}min`
  return `${Math.floor(m / 60)}h`
}

function groupLabel(iso: string): 'agora' | 'hoje' {
  const diff = Date.now() - new Date(iso).getTime()
  return diff < 30 * 60 * 1000 ? 'agora' : 'hoje'
}

export function ActivityRailDrawer({ open, onClose, items, isLoading }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const agoraItems = items.filter((i) => groupLabel(i.ts) === 'agora')
  const hojeItems  = items.filter((i) => groupLabel(i.ts) === 'hoje')

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[44] bg-black/30"
        aria-hidden
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Atividades recentes"
        aria-modal="true"
        className="fixed right-0 top-[60px] z-[45] flex h-[calc(100vh-60px)] w-[320px] flex-col dragon-elev-2 rounded-bl-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-jl-border-1 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-jl-fg-1">Atividades</span>
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-jl-fg-3" aria-label="Atualizando…" />}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-6 w-6 items-center justify-center rounded text-jl-fg-3 transition-colors hover:text-jl-fg-1 hover:bg-white/[0.05]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: 'thin' }} id="activity-rail-feed">
          {items.length === 0 && !isLoading && (
            <p className="px-4 py-8 text-center text-xs text-jl-fg-3">
              Nenhuma atividade nas últimas 2h
            </p>
          )}

          {agoraItems.length > 0 && (
            <section>
              <div className="px-4 pb-1 pt-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-jl-fg-3">
                  Agora
                </span>
              </div>
              {agoraItems.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </section>
          )}

          {hojeItems.length > 0 && (
            <section>
              <div className="px-4 pb-1 pt-3">
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-jl-fg-3">
                  Mais cedo hoje
                </span>
              </div>
              {hojeItems.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-jl-border-1 px-4 py-2.5">
          <Link
            href="/gerente/atividades"
            onClick={onClose}
            className="flex items-center justify-between text-xs text-jl-fg-3 transition-colors hover:text-jl-fg-1"
          >
            <span>Ver histórico completo</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </>
  )
}

function ActivityRow({ item }: Readonly<{ item: AtividadeRailItem }>) {
  const Icon = TIPO_ICON[item.tipo]
  const iconCn = TIPO_ICON_CN[item.tipo]
  const accentCn = SEVERITY_ACCENT[item.severity]

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-2 transition-colors hover:bg-white/[0.025]',
        accentCn,
      )}
    >
      <Icon className={cn('mt-px h-3.5 w-3.5 flex-shrink-0', iconCn)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] leading-snug text-jl-fg-1">{item.titulo}</p>
      </div>
      <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-jl-fg-3">
        {relTime(item.ts)}
      </span>
    </div>
  )
}
