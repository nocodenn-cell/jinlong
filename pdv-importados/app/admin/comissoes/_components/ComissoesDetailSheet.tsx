'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { MetricCard } from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import type { ComissaoDetalheRow, ComissaoResumoRow } from '@/app/gerente/comissoes/actions'
import type { ComissoesLabels } from './comissoesLabels'

type Props = {
  operador: ComissaoResumoRow
  rows: ComissaoDetalheRow[]
  loading: boolean
  error: string | null
  selecionados: Set<string>
  totalPendenteSelecionado: number
  labels: ComissoesLabels
  onClose: () => void
  onToggle: (id: string) => void
  onToggleTodos: () => void
  onMarcarPagas: () => void
}

function statusBadgeClass(isPendente: boolean): string {
  return isPendente ? 'admin-v2-badge-warning' : 'admin-v2-badge-success'
}

function moneyToneClass(kind: 'pago' | 'pendente'): string {
  if (kind === 'pago') return 'text-[var(--color-success-strong)]'
  return 'text-[var(--color-warning-strong)]'
}

/** Sheet de detalhe — padrão visual alinhado a VendaDetailSheet, escopo local. */
export function ComissoesDetailSheet({
  operador,
  rows,
  loading,
  error,
  selecionados,
  totalPendenteSelecionado,
  labels,
  onClose,
  onToggle,
  onToggleTodos,
  onMarcarPagas,
}: Props) {
  const pendentes = rows.filter((r) => r.status === 'pendente')
  const allSelected = pendentes.length > 0 && selecionados.size === pendentes.length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comissoes-detalhe-titulo"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside className="admin-v2-sheet relative z-10 flex h-full w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-secondary)] px-5 py-4">
          <div className="min-w-0">
            <h2
              id="comissoes-detalhe-titulo"
              className="truncate text-[15px] font-semibold text-jl-fg-1"
            >
              {operador.operador_nome}
            </h2>
            <p className="mt-0.5 text-[11px] text-jl-fg-3">
              {formatBRL(operador.total_pendente)} {labels.emPendenciaSuffix}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.fecharDetalhe}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-[var(--color-surface-soft)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="admin-v2-alert-danger mb-3 rounded-lg px-3 py-2 text-[12px]" role="alert">
              {error}
            </div>
          ) : null}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label={labels.metricTotal}
              value={formatBRL(operador.total_comissao)}
              tone="gold"
              icon="dollar-sign"
            />
            <MetricCard
              label={labels.metricPago}
              value={formatBRL(operador.total_pago)}
              tone="success"
              icon="file-check-2"
            />
            <MetricCard
              label={labels.metricPendente}
              value={formatBRL(operador.total_pendente)}
              tone="warning"
              icon="alert-circle"
            />
          </div>

          {loading ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg bg-jl-surface-soft opacity-70"
                />
              ))}
              <p className="sr-only">{labels.carregando}</p>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-jl-fg-3">{labels.semComissoes}</p>
          ) : (
            <div className="rounded-lg border border-[var(--color-border-secondary)]">
              {rows.map((row) => {
                const isPendente = row.status === 'pendente'
                const checkboxId = `comissao-${row.comissao_id}`
                return (
                  <div
                    key={row.comissao_id}
                    className="flex items-center gap-3 border-b border-[var(--color-border-secondary)] px-4 py-3 last:border-b-0"
                  >
                    {isPendente ? (
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={selecionados.has(row.comissao_id)}
                        onChange={() => onToggle(row.comissao_id)}
                        className="h-4 w-4 rounded border-[var(--color-border-secondary)] bg-transparent accent-jl-accent"
                        aria-label={`${labels.selecionarItem} ${row.venda_id.slice(0, 8)}`}
                      />
                    ) : (
                      <span className="h-4 w-4" aria-hidden />
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
                      <span
                        className={`mt-1 inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none ${statusBadgeClass(isPendente)}`}
                      >
                        {isPendente ? labels.statusPendente : labels.statusPago}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && pendentes.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border-secondary)] px-5 py-3">
            <button
              type="button"
              onClick={onToggleTodos}
              className="text-[12px] font-medium text-jl-accent underline-offset-2 hover:underline"
            >
              {allSelected ? labels.desselecionarTodas : labels.selecionarPendentes}
            </button>
            {selecionados.size > 0 ? (
              <button
                type="button"
                onClick={onMarcarPagas}
                className="admin-v2-btn-primary ml-auto"
              >
                {labels.marcarComoPagoBtn
                  .replace('{{n}}', String(selecionados.size))
                  .replace('{{valor}}', formatBRL(totalPendenteSelecionado))}
              </button>
            ) : (
              <p className={`ml-auto text-[11px] ${moneyToneClass('pendente')}`}>
                {formatBRL(operador.total_pendente)} {labels.emPendenciaSuffix}
              </p>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
