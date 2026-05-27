'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { labelFormaPagamentoVenda, labelStatusVenda } from '@/lib/format/vendaLabels'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { buscarVendasPaginadasAction, cancelarVendaGerenteAction } from './actions'
import type { VendaListRow } from './actions'
import { VendaDetalheModal } from './VendaDetalheModal'

function statusBadgeClasses(status: string): string {
  const s = status.toUpperCase()
  if (s === 'CANCELADA')
    return 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-danger'
  if (s === 'CONCLUIDA')
    return 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-positive'
  return 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-neutral'
}

type Props = {
  idioma: Idioma
  locale: string
  initialVendas: VendaListRow[]
  initialHasMore: boolean
}

export function VendasGerenteListClient({ idioma, locale, initialVendas, initialHasMore }: Props) {
  const m = getMessages(idioma)
  const [vendas, setVendas] = useState<VendaListRow[]>(initialVendas)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const [selecionada, setSelecionada] = useState<VendaListRow | null>(null)
  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Stable ref to avoid recreating the observer on each render
  const stateRef = useRef({ hasMore, loading })
  useEffect(() => {
    stateRef.current = { hasMore, loading }
  })

  const loadNextPage = useCallback(async () => {
    if (stateRef.current.loading || !stateRef.current.hasMore) return
    setLoading(true)
    const nextPage = pageRef.current + 1
    try {
      const result = await buscarVendasPaginadasAction(nextPage)
      if (!result.ok) {
        emitGerenteToast({ kind: 'error', message: result.error })
        return
      }
      pageRef.current = nextPage
      setVendas((prev) => [...prev, ...result.vendas])
      setHasMore(result.hasMore)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadNextPage()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadNextPage])

  /** Optimistic update local — após o server action terminar, o estado bate. */
  function aplicarCancelamentoLocal(vendaId: string) {
    setVendas((cur) => cur.map((v) => (v.id === vendaId ? { ...v, status: 'CANCELADA' } : v)))
    setSelecionada((s) => (s && s.id === vendaId ? { ...s, status: 'CANCELADA' } : s))
  }

  function handleRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, v: VendaListRow) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSelecionada(v)
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <ExportCsvButton
          label={m.gerente.exportar_csv}
          filename="gerente-vendas.csv"
          columns={[
            { key: 'data', header: m.gerente.col_data },
            { key: 'total_liquido', header: m.gerente.col_total },
            { key: 'forma_pagamento', header: m.gerente.col_forma },
            { key: 'status', header: m.gerente.col_status },
            { key: 'caixa_id', header: m.gerente.col_caixa },
          ]}
          rows={vendas.map((v) => ({
            data: v.data ? new Date(v.data).toISOString() : '',
            total_liquido: Number(v.total_liquido),
            forma_pagamento: labelFormaPagamentoVenda(v.forma_pagamento, m),
            status: labelStatusVenda(v.status, m),
            caixa_id: v.caixa_id ?? '',
          }))}
        />
      </div>

      <GerenteTable
        tone="dragon"
        columns={[
          { key: 'data', header: m.gerente.col_data },
          { key: 'total', header: m.gerente.col_total },
          { key: 'forma', header: m.gerente.col_forma },
          { key: 'status', header: m.gerente.col_status },
          { key: 'caixa', header: m.gerente.col_caixa },
          { key: 'chevron', header: '' },
        ]}
      >
        {vendas.map((v) => (
          <tr
            key={v.id}
            tabIndex={0}
            role="button"
            aria-label={`${m.gerente.ver_detalhes} — ${fmtGerenteBRL(Number(v.total_liquido), locale)} · ${labelStatusVenda(v.status, m)}`}
            onClick={() => setSelecionada(v)}
            onKeyDown={(e) => handleRowKeyDown(e, v)}
            className="gerente-fin-row-hover gerente-row-clickable cursor-pointer transition-colors focus:outline-none focus-visible:bg-amber-400/5 focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 tabular-nums">
              {fmtGerenteDateTime(v.data, locale)}
            </td>
            <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 font-medium tabular-nums">
              {fmtGerenteBRL(Number(v.total_liquido), locale)}
            </td>
            <td className="gerente-fin-cell px-3 py-3">{labelFormaPagamentoVenda(v.forma_pagamento, m)}</td>
            <td className="px-3 py-3">
              <span className={statusBadgeClasses(v.status ?? '')}>{labelStatusVenda(v.status, m)}</span>
            </td>
            <td className="gerente-fin-cell px-3 py-3 font-mono text-xs">{fmtGerenteIdCurto(v.caixa_id ?? undefined)}</td>
            <td className="gerente-fin-cell w-8 px-3 py-3 text-right text-base text-slate-400" aria-hidden>
              ›
            </td>
          </tr>
        ))}
        {vendas.length === 0 && (
          <tr>
            <td colSpan={6} className="gerente-fin-empty px-4 py-8 text-center">
              {m.gerente.nenhuma_venda}
            </td>
          </tr>
        )}
      </GerenteTable>

      {/* Sentinel para trigger do scroll infinito */}
      <div ref={sentinelRef} className="h-1" aria-hidden />

      {loading && (
        <p className="mt-4 text-center text-sm opacity-60">{m.comum.carregando ?? 'Carregando…'}</p>
      )}

      {selecionada && (
        <VendaDetalheModal
          venda={selecionada}
          locale={locale}
          idioma={idioma}
          onClose={() => setSelecionada(null)}
          onCancelarSucesso={aplicarCancelamentoLocal}
          cancelarAction={cancelarVendaGerenteAction}
        />
      )}
    </>
  )
}
