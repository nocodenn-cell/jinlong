'use client'

import { useCallback, useState } from 'react'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { formatBRL } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { ComissaoDetalheRow, ComissaoResumoRow, FiltroComissoes } from './actions'
import { carregarDetalheComissoes, carregarResumoComissoes, marcarComissoesPagas } from './actions'

type Props = Readonly<{ idioma: Idioma }>

const TODAY = new Date().toISOString().slice(0, 10)
const TRINTA_DIAS_ATRAS = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const inputClass =
  'h-8 rounded-lg border border-jl-border-1 bg-[#0a0f1e] px-3 text-xs text-jl-fg-1 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30'

export function ComissoesPageClient({ idioma }: Props) {
  const locale = localeFromIdioma(idioma)

  const [filtro, setFiltro] = useState<FiltroComissoes>({
    de: TRINTA_DIAS_ATRAS,
    ate: TODAY,
    status: 'todos',
  })

  const [operadorDetalhe, setOperadorDetalhe] = useState<ComissaoResumoRow | null>(null)
  const [detalheRows, setDetalheRows] = useState<ComissaoDetalheRow[]>([])
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const queryFn = useCallback(async () => {
    const r = await carregarResumoComissoes(filtro)
    if (!r.success) throw new Error(r.error)
    return r.data
  }, [filtro])
  const { data: resumo, loading, refetch } = useGerenteQuery(queryFn)

  const abrirDetalhe = useCallback(async (row: ComissaoResumoRow) => {
    setOperadorDetalhe(row)
    setDetalheLoading(true)
    setSelecionados(new Set())
    try {
      const r = await carregarDetalheComissoes(row.operador_id, filtro)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setDetalheRows(r.data)
    } finally {
      setDetalheLoading(false)
    }
  }, [filtro])

  const { mutate: marcarPagas, loading: marcandoPagas } = useGerenteMutation(
    async () => {
      if (!operadorDetalhe || selecionados.size === 0) return null
      const r = await marcarComissoesPagas({
        operador_id: operadorDetalhe.operador_id,
        ids: Array.from(selecionados),
      })
      if (!r.success) throw new Error(r.error)
      setSelecionados(new Set())
      await abrirDetalhe(operadorDetalhe)
      refetch()
      return null
    },
    { successMessage: 'Comissões marcadas como pagas.' },
  )

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTodos = () => {
    const pendentes = detalheRows.filter((r) => r.status === 'pendente').map((r) => r.comissao_id)
    setSelecionados((prev) =>
      prev.size === pendentes.length ? new Set() : new Set(pendentes),
    )
  }

  const totalPendente = detalheRows
    .filter((r) => r.status === 'pendente' && selecionados.has(r.comissao_id))
    .reduce((s, r) => s + r.valor_comissao, 0)

  return (
    <>
      {/* ── BARRA STICKY ──────────────────────────────────────────────────── */}
      <GerenteStickyToolbar className="py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-jl-fg-1 mr-2 shrink-0">
            Comissões por Vendedor
          </h1>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-jl-fg-3 uppercase tracking-wide">De</span>
            <input
              type="date"
              value={filtro.de ?? ''}
              onChange={(e) => setFiltro((f) => ({ ...f, de: e.target.value || undefined }))}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-jl-fg-3 uppercase tracking-wide">Até</span>
            <input
              type="date"
              value={filtro.ate ?? ''}
              onChange={(e) => setFiltro((f) => ({ ...f, ate: e.target.value || undefined }))}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-jl-fg-3 uppercase tracking-wide">Status</span>
            <select
              value={filtro.status}
              onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value as FiltroComissoes['status'] }))}
              className={inputClass}
            >
              <option value="todos">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="pago">Pagos</option>
            </select>
          </label>
        </div>
      </GerenteStickyToolbar>

      {/* ── CONTEÚDO ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        {loading ? (
          <p className="text-sm app-muted">Carregando…</p>
        ) : !resumo || resumo.length === 0 ? (
          <p className="text-sm app-muted">Nenhuma comissão no período.</p>
        ) : (
          <GerenteTable
            tone="dragon"
            columns={[
              { key: 'vendedor', header: 'Vendedor' },
              { key: 'vendas', header: 'Vendas' },
              { key: 'total', header: 'Total comissão' },
              { key: 'pago', header: 'Pago' },
              { key: 'pendente', header: 'Pendente' },
              { key: 'acoes', header: '' },
            ]}
          >
            {resumo.map((row) => (
              <tr key={row.operador_id} className="gerente-fin-row-hover transition-colors">
                <td className="gerente-fin-cell px-4 py-3 font-medium">{row.operador_nome}</td>
                <td className="gerente-fin-cell px-4 py-3 text-right tabular-nums">{row.total_vendas}</td>
                <td className="gerente-fin-cell px-4 py-3 text-right tabular-nums">{formatBRL(row.total_comissao, locale)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-400">
                  {formatBRL(row.total_pago, locale)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-400 font-semibold">
                  {formatBRL(row.total_pendente, locale)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void abrirDetalhe(row)}
                    className="rounded-md border px-3 py-1 text-xs font-medium transition-colors app-border app-btn-neutral"
                  >
                    Detalhes
                  </button>
                </td>
              </tr>
            ))}
          </GerenteTable>
        )}
      </div>

      {/* ── MODAL DE AUDITORIA ────────────────────────────────────────────── */}
      {operadorDetalhe && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto dragon-glass-backdrop px-4 py-12"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOperadorDetalhe(null) }}
        >
          <div
            className="dragon-glass-card w-full max-w-2xl rounded-2xl border border-jl-border-1 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-jl-fg-1">
                  {operadorDetalhe.operador_nome}
                </h2>
                <p className="text-xs app-muted">
                  Pendente: {formatBRL(operadorDetalhe.total_pendente, locale)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOperadorDetalhe(null)}
                className="text-jl-fg-3 hover:text-jl-fg-1 transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4">
              {detalheLoading ? (
                <p className="text-sm app-muted">Carregando…</p>
              ) : detalheRows.length === 0 ? (
                <p className="text-sm app-muted">Nenhum registro.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-jl-border-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-jl-border-1 bg-jl-surface-elev text-jl-fg-3">
                          <th className="px-3 py-2">
                            <input
                              type="checkbox"
                              onChange={toggleTodos}
                              checked={
                                selecionados.size > 0 &&
                                selecionados.size ===
                                  detalheRows.filter((r) => r.status === 'pendente').length
                              }
                            />
                          </th>
                          <th className="px-3 py-2 text-left font-medium">Data</th>
                          <th className="px-3 py-2 text-right font-medium">Base</th>
                          <th className="px-3 py-2 text-right font-medium">Comissão</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-jl-border-1">
                        {detalheRows.map((r) => (
                          <tr key={r.comissao_id} className="gerente-fin-row-hover">
                            <td className="px-3 py-2 text-center">
                              {r.status === 'pendente' && (
                                <input
                                  type="checkbox"
                                  checked={selecionados.has(r.comissao_id)}
                                  onChange={() => toggleSelecionado(r.comissao_id)}
                                />
                              )}
                            </td>
                            <td className="gerente-fin-cell px-3 py-2 tabular-nums">
                              {new Date(r.created_at).toLocaleDateString(locale)}
                            </td>
                            <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums">
                              {formatBRL(r.base_calculo, locale)}
                            </td>
                            <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums font-semibold">
                              {formatBRL(r.valor_comissao, locale)}
                            </td>
                            <td className="px-3 py-2">
                              {r.status === 'pago' ? (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold app-badge-positive">
                                  Pago
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold app-badge-warn">
                                  Pendente
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selecionados.size > 0 && (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-jl-border-1 bg-jl-surface-elev px-4 py-3">
                      <span className="text-sm text-jl-fg-1">
                        {selecionados.size} selecionado(s) · {formatBRL(totalPendente, locale)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void marcarPagas(null)}
                        disabled={marcandoPagas}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors app-btn-accent disabled:opacity-60"
                      >
                        {marcandoPagas ? '…' : 'Marcar como Pago'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
