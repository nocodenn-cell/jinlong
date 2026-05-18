'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { labelFormaPagamentoVenda, labelStatusVenda } from '@/lib/format/vendaLabels'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { buscarVendasPaginadasAction, cancelarVendaGerenteAction } from './actions'
import type { VendaListRow } from './actions'

function statusBadgeClasses(status: string): string {
  const s = status.toUpperCase()
  if (s === 'CANCELADA') return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-danger'
  if (s === 'CONCLUIDA') return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-positive'
  return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-btn-neutral'
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
  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Stable ref to avoid recreating the observer on each render
  const stateRef = useRef({ hasMore, loading })
  useEffect(() => { stateRef.current = { hasMore, loading } })

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
      (entries) => { if (entries[0]?.isIntersecting) loadNextPage().catch(() => undefined) },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadNextPage])

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
          { key: 'detalhes', header: m.gerente.col_detalhes },
          { key: 'acoes', header: m.gerente.col_acoes },
        ]}
      >
        {vendas.map((v) => (
          <tr key={v.id} className="gerente-fin-row-hover transition-colors">
            <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 tabular-nums">
              {fmtGerenteDateTime(v.data, locale)}
            </td>
            <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 font-medium tabular-nums">
              {fmtGerenteBRL(Number(v.total_liquido), locale)}
            </td>
            <td className="gerente-fin-cell px-3 py-3">
              {labelFormaPagamentoVenda(v.forma_pagamento, m)}
            </td>
            <td className="px-3 py-3">
              <span className={statusBadgeClasses(v.status ?? '')}>
                {labelStatusVenda(v.status, m)}
              </span>
            </td>
            <td className="gerente-fin-cell px-3 py-3 font-mono text-xs">
              {fmtGerenteIdCurto(v.caixa_id ?? undefined)}
            </td>
            <td className="px-3 py-3">
              <Link
                href={`/gerente/vendas/${v.id}`}
                className="gerente-section-accent text-sm font-medium hover:underline"
              >
                {m.gerente.ver_detalhes}
              </Link>
            </td>
            <td className="min-w-[min(100%,280px)] max-w-[360px] px-3 py-3">
              {v.status !== 'CANCELADA' ? (
                <form
                  action={cancelarVendaGerenteAction}
                  className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch"
                >
                  <input type="hidden" name="venda_id" value={v.id} />
                  <input
                    name="motivo"
                    placeholder={m.gerente.venda_motivo_cancel_placeholder}
                    required
                    minLength={2}
                    maxLength={500}
                    className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm shadow-inner app-input"
                  />
                  <ConfirmActionButton
                    type="submit"
                    confirmMessage={`Confirma o cancelamento da venda ${fmtGerenteIdCurto(v.id)}? Esta ação não pode ser desfeita.`}
                    className="gerente-btn-cancel app-btn-danger shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
                  >
                    {m.comum.cancelar}
                  </ConfirmActionButton>
                </form>
              ) : (
                <span className="gerente-fin-empty text-sm">{m.gerente.venda_ja_cancelada}</span>
              )}
            </td>
          </tr>
        ))}
        {vendas.length === 0 && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-8 text-center">
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
    </>
  )
}
