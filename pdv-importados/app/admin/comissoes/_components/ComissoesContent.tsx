'use client'

/**
 * FastProduct Admin — ComissoesContent (Fase 8)
 *
 * Client component com tabela de resumo de comissões + sheet detalhe.
 * Reutiliza actions de /gerente/comissoes (resumo, detalhe, marcar pago).
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MetricCard, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { EntityTable, type EntityColumn } from '@/components/ui/EntityTable'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
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
  locale: string
}

type Props = {
  dados: ComissaoResumoRow[]
  filtroInicial: FiltroComissoes
  labels: ComissoesLabels
}

export function ComissoesContent({ dados, filtroInicial, labels }: Props) {
  const router = useRouter()
  const [rows] = useState(dados)
  const [detalheOperador, setDetalheOperador] = useState<ComissaoResumoRow | null>(null)
  const [detalheRows, setDetalheRows] = useState<ComissaoDetalheRow[]>([])
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const statusDisplayMap: Record<string, string> = {
    todos: labels.statusTodos,
    pendente: labels.statusPendente,
    pago: labels.statusPago,
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

  const columns: EntityColumn<ComissaoResumoRow>[] = [
    {
      key: 'operador',
      header: labels.colOperador,
      sortValue: (r) => r.operador_nome,
      cell: (r) => (
        <button
          type="button"
          onClick={() => void abrirDetalhe(r)}
          className="font-medium text-brand transition-colors hover:underline"
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
      cell: (r) => <span className="text-body text-fg-muted tabular-nums">{r.total_vendas}</span>,
    },
    {
      key: 'comissao_total',
      header: labels.colTotal,
      money: (r) => r.total_comissao,
      moneyLocale: labels.locale,
    },
    {
      key: 'comissao_pago',
      header: labels.colPago,
      money: (r) => r.total_pago,
      moneyLocale: labels.locale,
    },
    {
      key: 'comissao_pendente',
      header: labels.colPendente,
      money: (r) => r.total_pendente,
      moneyLocale: labels.locale,
    },
  ]

  const statusDisplay = statusDisplayMap[filtroInicial.status] ?? filtroInicial.status

  return (
    <div className="flex flex-col gap-6">
      {error ? <ErrorState dense title={error} /> : null}

      <SectionCard
        title={labels.operadoresTitulo.replace('{{n}}', String(rows.length))}
        subtitle={`${labels.periodoLabel}: ${filtroInicial.de}${labels.aSeparator}${filtroInicial.ate} · ${labels.statusLabel}: ${statusDisplay}`}
      >
        <EntityTable
          data={rows}
          columns={columns}
          rowKey={(r) => r.operador_id}
          onRowClick={(r) => void abrirDetalhe(r)}
          emptyState={<EmptyState title={labels.vazioComissoes} />}
          className="rounded-none border-x-0 border-[var(--color-border-secondary)]"
        />
      </SectionCard>

      {detalheOperador ? (
        <SectionCard
          title={detalheOperador.operador_nome}
          subtitle={`${formatBRL(detalheOperador.total_pendente)} ${labels.emPendenciaSuffix}`}
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDetalheOperador(null)}
              aria-label={labels.fecharDetalhe}
            >
              ✕
            </Button>
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
                <Button type="button" variant="ghost" size="sm" onClick={toggleTodos}>
                  {selecionados.size === detalheRows.filter((r) => r.status === 'pendente').length
                    ? labels.desselecionarTodas
                    : labels.selecionarPendentes}
                </Button>
                {selecionados.size > 0 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="ml-auto"
                    onClick={() => void marcarPagas()}
                  >
                    {labels.marcarComoPagoBtn
                      .replace('{{n}}', String(selecionados.size))
                      .replace('{{valor}}', formatBRL(totalPendente))}
                  </Button>
                ) : null}
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
            <EmptyState title={labels.semComissoes} className="py-8" />
          )}
        </SectionCard>
      ) : null}
    </div>
  )
}
