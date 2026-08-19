'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { MetricCard } from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import type { AjusteComissao, ComissaoDetalheRow, ComissaoResumoRow } from '@/app/gerente/comissoes/actions'
import type { ComissoesLabels } from './comissoesLabels'

type Props = {
  operador: ComissaoResumoRow
  rows: ComissaoDetalheRow[]
  loading: boolean
  error: string | null
  selecionados: Set<string>
  totalBrutoSelecionado: number
  marcandoPagas: boolean
  labels: ComissoesLabels
  onClose: () => void
  onToggle: (id: string) => void
  onToggleTodos: () => void
  onMarcarPagas: () => void
}

function statusBadgeClass(isPendente: boolean): string {
  return isPendente ? 'admin-v2-badge-warning' : 'admin-v2-badge-success'
}

function saldoToneClass(valor: number): string {
  if (valor > 0) return 'text-[var(--color-warning-strong)]'
  if (valor < 0) return 'text-[var(--color-danger-strong)]'
  return 'text-jl-fg-3'
}

function tipoLabel(tipo: AjusteComissao['tipo'], labels: ComissoesLabels): string {
  if (tipo === 'CANCELAMENTO') return labels.tipoCancelamento
  if (tipo === 'DEVOLUCAO') return labels.tipoDevolucao
  return labels.tipoTroca
}

function tipoBadgeClass(tipo: AjusteComissao['tipo']): string {
  if (tipo === 'CANCELAMENTO') return 'admin-v2-badge-danger'
  if (tipo === 'TROCA') return 'admin-v2-badge-gold'
  return 'admin-v2-badge-warning'
}

function origemLabel(origemTipo: AjusteComissao['origemTipo'], labels: ComissoesLabels): string {
  return origemTipo === 'VENDA' ? labels.ajusteOrigemVenda : labels.ajusteOrigemPosVenda
}

/** Lista compacta dos ajustes de uma comissão — tipo real distinguível, ator, consumo. */
function AjustesList({ ajustes, labels }: { ajustes: AjusteComissao[]; labels: ComissoesLabels }) {
  if (ajustes.length === 0) {
    return <p className="mt-2 text-[11px] text-jl-fg-3">{labels.ajustesVazio}</p>
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-[var(--color-border-secondary)] pt-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-jl-fg-3">
        {labels.ajustesTitulo}
      </p>
      {ajustes.map((a) => (
        <div key={a.ajusteId} className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-medium leading-none ${tipoBadgeClass(a.tipo)}`}
            >
              {tipoLabel(a.tipo, labels)}
            </span>
            <span className="text-jl-fg-3">{origemLabel(a.origemTipo, labels)}</span>
          </div>
          <div className="text-right text-jl-fg-2">
            <span className="tabular-nums">−{formatBRL(a.valor)}</span>
            <span className="ml-1 text-jl-fg-3">
              ({a.valorPendente > 0 ? labels.ajustePendente : labels.ajusteConsumido})
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Sheet de detalhe — padrão visual alinhado a VendaDetailSheet, escopo local. */
export function ComissoesDetailSheet({
  operador,
  rows,
  loading,
  error,
  selecionados,
  totalBrutoSelecionado,
  marcandoPagas,
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
              {operador.operadorNome}
            </h2>
            <p className={`mt-0.5 text-[11px] ${saldoToneClass(operador.totalSaldoResidual)}`}>
              {formatBRL(operador.totalSaldoResidual)} {labels.saldoResidualSuffix}
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
          <div className="mb-4 grid grid-cols-2 gap-3">
            <MetricCard
              label={labels.metricBruto}
              value={formatBRL(operador.totalComissaoBruta)}
              tone="gold"
              icon="dollar-sign"
            />
            <MetricCard
              label={labels.metricAjustes}
              value={operador.totalAjustes > 0 ? `−${formatBRL(operador.totalAjustes)}` : formatBRL(0)}
              tone="danger"
              icon="alert-circle"
            />
            <MetricCard
              label={labels.metricLiquidoPago}
              value={formatBRL(operador.totalLiquidoPago)}
              tone="success"
              icon="file-check-2"
            />
            <MetricCard
              label={labels.metricSaldoResidual}
              value={formatBRL(operador.totalSaldoResidual)}
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
                const checkboxId = `comissao-${row.comissaoId}`
                return (
                  <div
                    key={row.comissaoId}
                    className="flex items-start gap-3 border-b border-[var(--color-border-secondary)] px-4 py-3 last:border-b-0"
                  >
                    {isPendente ? (
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={selecionados.has(row.comissaoId)}
                        onChange={() => onToggle(row.comissaoId)}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-secondary)] bg-transparent accent-jl-accent"
                        aria-label={`${labels.selecionarItem} ${row.vendaId.slice(0, 8)}`}
                      />
                    ) : (
                      <span className="mt-0.5 h-4 w-4" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] text-jl-fg-1">
                            {labels.vendaPrefix} {row.vendaId.slice(0, 8)}…
                          </p>
                          <p className="text-[11px] text-jl-fg-3">
                            {new Date(row.createdAt).toLocaleDateString(labels.locale)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[12px] font-medium text-jl-fg-1">
                            {formatBRL(row.valorOriginal)}
                          </p>
                          <span
                            className={`mt-1 inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none ${statusBadgeClass(isPendente)}`}
                          >
                            {isPendente ? labels.statusPendente : labels.statusPago}
                          </span>
                        </div>
                      </div>

                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-jl-fg-3 sm:grid-cols-4">
                        <div className="flex justify-between gap-1">
                          <dt>{labels.detalheAjustado}</dt>
                          <dd className="tabular-nums text-jl-fg-2">
                            {row.valorAjustado > 0 ? `−${formatBRL(row.valorAjustado)}` : formatBRL(0)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-1">
                          <dt>{labels.detalheLiquidoApurado}</dt>
                          <dd className="tabular-nums text-jl-fg-2">{formatBRL(row.valorLiquidoApurado)}</dd>
                        </div>
                        <div className="flex justify-between gap-1">
                          <dt>{labels.detalhePago}</dt>
                          <dd className="tabular-nums text-jl-fg-2">
                            {row.valorPago == null ? '—' : formatBRL(row.valorPago)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-1">
                          <dt>{labels.detalheSaldo}</dt>
                          <dd className={`tabular-nums font-medium ${saldoToneClass(row.saldoFinal)}`}>
                            {formatBRL(row.saldoFinal)}
                          </dd>
                        </div>
                      </dl>

                      <AjustesList ajustes={row.ajustes} labels={labels} />
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
                disabled={marcandoPagas}
                className="admin-v2-btn-primary ml-auto disabled:opacity-60"
              >
                {marcandoPagas
                  ? '…'
                  : labels.marcarComoPagoBtn
                      .replace('{{n}}', String(selecionados.size))
                      .replace('{{valor}}', formatBRL(totalBrutoSelecionado))}
              </button>
            ) : (
              <p className={`ml-auto text-[11px] ${saldoToneClass(operador.totalSaldoResidual)}`}>
                {formatBRL(operador.totalSaldoResidual)} {labels.saldoResidualSuffix}
              </p>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
