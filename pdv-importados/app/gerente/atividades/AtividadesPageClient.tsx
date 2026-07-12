'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Receipt, Wallet, FileCheck, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AtividadeHistoryPayload, AtividadeRailItem } from '@/app/api/gerente/atividades/history/route'

type WindowFilter = '2h' | '24h' | '7d' | '30d'
type TipoFilter   = 'ALL' | 'VENDA' | 'FISCAL_OK' | 'FISCAL_ERRO' | 'CAIXA'

const WINDOWS: { value: WindowFilter; label: string }[] = [
  { value: '2h',  label: 'Últimas 2h'  },
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d',  label: '7 dias'      },
  { value: '30d', label: '30 dias'     },
]

const TIPOS: { value: TipoFilter; label: string }[] = [
  { value: 'ALL',        label: 'Tudo'          },
  { value: 'VENDA',      label: 'Vendas'        },
  { value: 'FISCAL_OK',  label: 'Fiscal'        },
  { value: 'FISCAL_ERRO',label: 'Erros fiscais' },
  { value: 'CAIXA',      label: 'Caixa'         },
]

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

const TIPO_LABEL = {
  VENDA:       'Venda',
  CAIXA:       'Caixa',
  FISCAL_OK:   'Fiscal',
  FISCAL_ERRO: 'Fiscal erro',
} as const

const SEVERITY_ROW_CN = {
  info:    '',
  warning: 'border-l-2 border-amber-400/60',
  error:   'border-l-2 border-red-500/70',
} as const

function fmtDateTime(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ActivityRow({ item, locale }: Readonly<{ item: AtividadeRailItem; locale: string }>) {
  const Icon = TIPO_ICON[item.tipo]
  return (
    <tr className={cn('border-b border-white/[0.06] transition-colors hover:bg-white/[0.025]', SEVERITY_ROW_CN[item.severity])}>
      <td className="w-10 px-4 py-2">
        <Icon className={cn('h-3.5 w-3.5', TIPO_ICON_CN[item.tipo])} aria-hidden />
      </td>
      <td className="px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-jl-fg-3">
          {TIPO_LABEL[item.tipo]}
        </span>
      </td>
      <td className="max-w-[360px] px-3 py-2 text-sm text-jl-fg-1">{item.titulo}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs tabular-nums text-jl-fg-3">
        {fmtDateTime(item.ts, locale)}
      </td>
    </tr>
  )
}

export function AtividadesPageClient({ locale }: Readonly<{ locale: string }>) {
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('24h')
  const [tipoFilter,   setTipoFilter]   = useState<TipoFilter>('ALL')
  const [page,         setPage]         = useState(1)
  const [data,         setData]         = useState<AtividadeHistoryPayload | null>(null)
  const [loading,      setLoading]      = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (w: WindowFilter, t: TipoFilter, p: number) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const res = await fetch(`/api/gerente/atividades/history?window=${w}&tipo=${t}&page=${p}`, { signal: ctrl.signal })
      if (res.ok) setData(await res.json() as AtividadeHistoryPayload)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData(windowFilter, tipoFilter, page) }, [fetchData, windowFilter, tipoFilter, page])

  function changeWindow(w: WindowFilter) { setWindowFilter(w); setPage(1) }
  function changeTipo(t: TipoFilter)     { setTipoFilter(t);   setPage(1) }

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1.5 flex-wrap">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => changeWindow(w.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                windowFilter === w.value
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-white/[0.07] text-jl-fg-3 hover:text-jl-fg-1',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TIPOS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => changeTipo(t.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                tipoFilter === t.value
                  ? 'bg-white/[0.12] text-jl-fg-1'
                  : 'bg-white/[0.05] text-jl-fg-3 hover:text-jl-fg-1',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {loading && <span className="ml-auto text-[11px] text-jl-fg-3">Carregando…</span>}
      </div>

      {/* Table */}
      <div className="dragon-glass-card overflow-x-auto rounded-xl">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-jl-border-1">
              <th className="w-10 px-4 py-2.5" aria-hidden />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-jl-fg-3">Tipo</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-jl-fg-3">Atividade</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-jl-fg-3">Data / hora</th>
            </tr>
          </thead>
          <tbody>
            {!loading && data && data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-jl-fg-3">
                  Nenhuma atividade neste período.
                </td>
              </tr>
            )}
            {data?.items.map((item) => (
              <ActivityRow key={item.id} item={item} locale={locale} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-jl-fg-3">
          <span>
            {data.total} atividade{data.total !== 1 ? 's' : ''} &middot; página {data.page} de {data.totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1}
              className="rounded px-2 py-1 transition hover:bg-white/[0.07] hover:text-jl-fg-1 disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={data.page >= data.totalPages}
              className="rounded px-2 py-1 transition hover:bg-white/[0.07] hover:text-jl-fg-1 disabled:opacity-40"
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
