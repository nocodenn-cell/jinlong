'use client'

/**
 * FastProduct Admin — ComissoesContent (Fase 8)
 *
 * Client component com tabela de resumo de comissões + sheet detalhe.
 * Reutiliza actions de /gerente/comissoes (resumo, detalhe, marcar pago).
 */

import { useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { MetricCard, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import type { ComissaoResumoRow, ComissaoDetalheRow, FiltroComissoes } from '@/app/gerente/comissoes/actions'
import {
  carregarDetalheComissoes,
  marcarComissoesPagas,
} from '@/app/gerente/comissoes/actions'

export type ComissoesLabels = {
  colOperador: string
  colVendas: string
  colTotal: string
  colPago: string
  colPendente: string
  operadoresTitulo: string
  periodoLabel: string
  aSeparator: string
  statusLabel: string
  statusTodos: string
  statusPendente: string
  statusPago: string
  vazioComissoes: string
  emPendenciaSuffix: string
  fecharDetalhe: string
  metricTotal: string
  metricPago: string
  metricPendente: string
  carregando: string
  desselecionarTodas: string
  selecionarPendentes: string
  marcarComoPagoBtn: string
  vendaPrefix: string
  semComissoes: string
  erroPagarFallback: string
  filtroDe: string
  filtroAte: string
  filtrar: string
  limparFiltros: string
  locale: string
}

type Props = {
  dados: ComissaoResumoRow[]
  loadError: string | null
  filtroInicial: FiltroComissoes
  labels: ComissoesLabels
}

export function ComissoesContent({ dados, loadError, filtroInicial, labels }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [rows] = useState(dados)
  const [de, setDe] = useState(filtroInicial.de ?? '')
  const [ate, setAte] = useState(filtroInicial.ate ?? '')
  const [status, setStatus] = useState(filtroInicial.status)
  const [detalheOperador, setDetalheOperador] = useState<ComissaoResumoRow | null>(null)
  const [detalheRows, setDetalheRows] = useState<ComissaoDetalheRow[]>([])
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function navegar(params: { de?: string; ate?: string; status?: FiltroComissoes['status'] }) {
    const sp = new URLSearchParams()
    sp.set('de', params.de ?? de)
    sp.set('ate', params.ate ?? ate)
    const s = params.status ?? status
    if (s !== 'todos') sp.set('status', s)
    router.push(`${pathname}?${sp.toString()}`)
  }

  const abrirDetalhe = useCallback(async (row: ComissaoResumoRow) => {
    setDetalheOperador(row)
    setDetalheLoading(true)
    setSelecionados(new Set())
    setError(null)

    try {
      const res = await carregarDetalheComissoes(row.operador_id, filtroInicial)
      if (!res.success) {
        setError(res.error)
        return
      }
      setDetalheRows(res.data)
    } finally {
      setDetalheLoading(false)
    }
  }, [filtroInicial])

  const marcarPagas = async () => {
    if (!detalheOperador || selecionados.size === 0) return
    setError(null)

    try {
      const res = await marcarComissoesPagas({
        operador_id: detalheOperador.operador_id,
        ids: Array.from(selecionados),
      })
      if (!res.success) {
        setError(res.error)
        return
      }

      setSelecionados(new Set())
      await abrirDetalhe(detalheOperador)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.erroPagarFallback)
    }
  }

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTodos = () => {
    const pendentes = detalheRows
      .filter((r) => r.status === 'pendente')
      .map((r) => r.comissao_id)
    setSelecionados((prev) =>
      prev.size === pendentes.length ? new Set() : new Set(pendentes)
    )
  }

  const totalPendente = detalheRows
    .filter((r) => r.status === 'pendente' && selecionados.has(r.comissao_id))
    .reduce((s, r) => s + r.valor_comissao, 0)

  const columns: Column<ComissaoResumoRow>[] = [
    {
      key: 'operador',
      header: labels.colOperador,
      sortValue: (r) => r.operador_nome,
      cell: (r) => (
        <button
          onClick={() => abrirDetalhe(r)}
          className="font-medium text-jl-accent transition-colors hover:text-amber-300"
        >
          {r.operador_nome}
        </button>
      ),
    },
    {
      key: 'vendas',
      header: labels.colVendas,
      align: 'right',
      sortValue: (r) => r.total_vendas,
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{r.total_vendas}</span>,
    },
    {
      key: 'comissao_total',
      header: labels.colTotal,
      align: 'right',
      sortValue: (r) => r.total_comissao,
      cell: (r) => (
        <span className="text-[12px] font-medium text-jl-fg-1">
          {formatBRL(r.total_comissao)}
        </span>
      ),
    },
    {
      key: 'comissao_pago',
      header: labels.colPago,
      align: 'right',
      sortValue: (r) => r.total_pago,
      cell: (r) => (
        <span className="text-[12px] text-emerald-400">{formatBRL(r.total_pago)}</span>
      ),
    },
    {
      key: 'comissao_pendente',
      header: labels.colPendente,
      align: 'right',
      sortValue: (r) => r.total_pendente,
      cell: (r) => (
        <span className="text-[12px] text-amber-400">{formatBRL(r.total_pendente)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <div className="admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]" role="alert">
          {loadError}
        </div>
      )}

      {error && (
        <div className="admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-jl-fg-3">{labels.filtroDe}</span>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="admin-v2-input px-3 py-2 text-[12px] outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-jl-fg-3">{labels.filtroAte}</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="admin-v2-input px-3 py-2 text-[12px] outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-jl-fg-3">{labels.statusLabel}</span>
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value as FiltroComissoes['status']
              setStatus(v)
              navegar({ status: v })
            }}
            className="admin-v2-input px-3 py-2 text-[12px] outline-none"
          >
            <option value="todos">{labels.statusTodos}</option>
            <option value="pendente">{labels.statusPendente}</option>
            <option value="pago">{labels.statusPago}</option>
          </select>
        </label>
        <button onClick={() => navegar({})} className="admin-v2-btn-secondary">
          {labels.filtrar}
        </button>
        {(de !== filtroInicial.de || ate !== filtroInicial.ate || status !== 'todos') && (
          <button
            onClick={() => {
              const hoje = new Date().toISOString().slice(0, 10)
              const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
              setDe(trintaDiasAtras)
              setAte(hoje)
              setStatus('todos')
              navegar({ de: trintaDiasAtras, ate: hoje, status: 'todos' })
            }}
            className="admin-v2-btn-secondary"
          >
            {labels.limparFiltros}
          </button>
        )}
      </div>

      <SectionCard title={labels.operadoresTitulo.replace('{{n}}', String(rows.length))}>
        <DataTable
          data={rows}
          columns={columns}
          rowKey={(r) => r.operador_id}
          emptyState={
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="text-3xl text-jl-fg-3" aria-hidden>
                💼
              </span>
              <p className="text-[12px] text-jl-fg-3">
                {labels.vazioComissoes}
              </p>
            </div>
          }
          className="rounded-none border-x-0 border-[var(--color-border-secondary)]"
        />
      </SectionCard>

      {detalheOperador && (
        <SectionCard
          title={detalheOperador.operador_nome}
          subtitle={`${formatBRL(detalheOperador.total_pendente)} ${labels.emPendenciaSuffix}`}
          action={
            <button
              onClick={() => setDetalheOperador(null)}
              className="admin-v2-btn-secondary px-2 py-1"
              aria-label={labels.fecharDetalhe}
            >
              ✕
            </button>
          }
        >
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label={labels.metricTotal}
              value={formatBRL(detalheOperador.total_comissao)}
              tone="gold"
            />
            <MetricCard
              label={labels.metricPago}
              value={formatBRL(detalheOperador.total_pago)}
              tone="success"
            />
            <MetricCard
              label={labels.metricPendente}
              value={formatBRL(detalheOperador.total_pendente)}
              tone="gold"
            />
          </div>

          {detalheLoading ? (
            <div className="border-t border-[var(--color-border-secondary)] py-3 text-center text-[12px] text-jl-fg-3">
              {labels.carregando}
            </div>
          ) : detalheRows.length > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-border-secondary)] pt-4">
                <button
                  onClick={toggleTodos}
                  className="text-[12px] text-jl-accent transition-colors hover:text-amber-300"
                >
                  {selecionados.size === detalheRows.filter((r) => r.status === 'pendente').length
                    ? labels.desselecionarTodas
                    : labels.selecionarPendentes}
                </button>
                {selecionados.size > 0 && (
                  <button
                    onClick={marcarPagas}
                    className="admin-v2-btn-primary ml-auto"
                  >
                    {labels.marcarComoPagoBtn
                      .replace('{{n}}', String(selecionados.size))
                      .replace('{{valor}}', formatBRL(totalPendente))}
                  </button>
                )}
              </div>

              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-[var(--color-border-secondary)]">
                {detalheRows.map((row) => {
                  const isPendente = row.status === 'pendente'
                  return (
                    <div
                      key={row.comissao_id}
                      className="flex items-center gap-3 border-b border-[var(--color-border-secondary)] px-4 py-3 last:border-b-0 hover:bg-white/[0.03]"
                    >
                      {isPendente && (
                        <input
                          type="checkbox"
                          checked={selecionados.has(row.comissao_id)}
                          onChange={() => toggleSelecionado(row.comissao_id)}
                          className="h-4 w-4 rounded border-[var(--color-border-secondary)] bg-transparent accent-jl-accent"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-jl-fg-1">
                          {labels.vendaPrefix} {row.venda_id.slice(0, 8)}…
                        </p>
                        <p className="text-[11px] text-jl-fg-3">
                          {new Date(row.created_at).toLocaleDateString(labels.locale)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] font-medium text-jl-fg-1">
                          {formatBRL(row.valor_comissao)}
                        </p>
                        <p
                          className={`text-[11px] ${
                            isPendente ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {isPendente ? labels.statusPendente : labels.statusPago}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="border-t border-[var(--color-border-secondary)] py-4 text-center text-[12px] text-jl-fg-3">
              {labels.semComissoes}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
