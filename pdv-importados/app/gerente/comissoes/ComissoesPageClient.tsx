'use client'

import { useCallback, useState } from 'react'
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
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-xl font-bold text-foreground">Comissões por Vendedor</h1>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">De</label>
          <input
            type="date"
            value={filtro.de ?? ''}
            onChange={(e) => setFiltro((f) => ({ ...f, de: e.target.value || undefined }))}
            className="h-9 rounded-md border border-border bg-background px-3 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <input
            type="date"
            value={filtro.ate ?? ''}
            onChange={(e) => setFiltro((f) => ({ ...f, ate: e.target.value || undefined }))}
            className="h-9 rounded-md border border-border bg-background px-3 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <select
            value={filtro.status}
            onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value as FiltroComissoes['status'] }))}
            className="h-9 rounded-md border border-border bg-background px-3 text-xs"
          >
            <option value="todos">Todos</option>
            <option value="pendente">Pendentes</option>
            <option value="pago">Pagos</option>
          </select>
        </div>
      </div>

      {/* Tabela resumo */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !resumo || resumo.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma comissão no período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/50 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Vendedor</th>
                <th className="px-4 py-2 text-right font-medium">Vendas</th>
                <th className="px-4 py-2 text-right font-medium">Total comissão</th>
                <th className="px-4 py-2 text-right font-medium">Pago</th>
                <th className="px-4 py-2 text-right font-medium">Pendente</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resumo.map((row) => (
                <tr key={row.operador_id} className="hover:bg-accent/5">
                  <td className="px-4 py-3 font-medium text-foreground">{row.operador_nome}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.total_vendas}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBRL(row.total_comissao, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatBRL(row.total_pago, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-600 font-semibold">
                    {formatBRL(row.total_pendente, locale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void abrirDetalhe(row)}
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-accent/10"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de auditoria */}
      {operadorDetalhe && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-12">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {operadorDetalhe.operador_nome}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pendente: {formatBRL(operadorDetalhe.total_pendente, locale)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOperadorDetalhe(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4">
              {detalheLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : detalheRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum registro.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-card/50 text-muted-foreground">
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
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-right">Base</th>
                          <th className="px-3 py-2 text-right">Comissão</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {detalheRows.map((r) => (
                          <tr key={r.comissao_id} className="hover:bg-accent/5">
                            <td className="px-3 py-2 text-center">
                              {r.status === 'pendente' && (
                                <input
                                  type="checkbox"
                                  checked={selecionados.has(r.comissao_id)}
                                  onChange={() => toggleSelecionado(r.comissao_id)}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {new Date(r.created_at).toLocaleDateString(locale)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatBRL(r.base_calculo, locale)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">
                              {formatBRL(r.valor_comissao, locale)}
                            </td>
                            <td className="px-3 py-2">
                              {r.status === 'pago' ? (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Pago
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
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
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
                      <span className="text-sm text-foreground">
                        {selecionados.size} selecionado(s) · {formatBRL(totalPendente, locale)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void marcarPagas(null)}
                        disabled={marcandoPagas}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
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
    </div>
  )
}
