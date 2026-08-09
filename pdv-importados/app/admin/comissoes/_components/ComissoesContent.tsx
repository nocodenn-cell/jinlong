'use client'

/**
 * FastProduct Admin — ComissoesContent
 *
 * Resumo por operador + sheet de detalhe + marcar como pago.
 * Reutiliza actions de /gerente/comissoes (sem alterar contratos).
 */

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Percent } from 'lucide-react'
import { MetricCard, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/feedback'
import { formatBRL } from '@/lib/format/money'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { ComissaoResumoRow, ComissaoDetalheRow, FiltroComissoes } from '@/app/gerente/comissoes/actions'
import {
  carregarDetalheComissoes,
  marcarComissoesPagas,
} from '@/app/gerente/comissoes/actions'
import { ComissoesDetailSheet } from './ComissoesDetailSheet'
import type { ComissoesLabels } from './comissoesLabels'

export type { ComissoesLabels } from './comissoesLabels'

type Props = {
  dados: ComissaoResumoRow[]
  filtroInicial: FiltroComissoes
  labels: ComissoesLabels
}

function focusFiltros() {
  const root = document.getElementById('comissoes-filtros')
  if (!root) return
  root.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const first = root.querySelector<HTMLElement>('input, select, button, a')
  first?.focus()
}

function moneyStatusClass(kind: 'pago' | 'pendente'): string {
  if (kind === 'pago') return 'text-[12px] text-[var(--color-success-strong)]'
  return 'text-[12px] font-medium text-[var(--color-warning-strong)]'
}

export function ComissoesContent({ dados, filtroInicial, labels }: Props) {
  const router = useRouter()
  const [rows] = useState(dados)
  const [detalheOperador, setDetalheOperador] = useState<ComissaoResumoRow | null>(null)
  const [detalheRows, setDetalheRows] = useState<ComissaoDetalheRow[]>([])
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const kpis = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.total += r.total_comissao
        acc.pago += r.total_pago
        acc.pendente += r.total_pendente
        return acc
      },
      { total: 0, pago: 0, pendente: 0 },
    )
  }, [rows])

  const statusDisplayMap: Record<string, string> = {
    todos: labels.statusTodos,
    pendente: labels.statusPendente,
    pago: labels.statusPago,
  }

  const abrirDetalhe = useCallback(
    async (row: ComissaoResumoRow) => {
      setDetalheOperador(row)
      setDetalheLoading(true)
      setSelecionados(new Set())
      setError(null)

      try {
        const res = await carregarDetalheComissoes(row.operador_id, filtroInicial)
        if (!res.success) {
          setError(res.error)
          emitGerenteToast({ kind: 'error', message: res.error })
          return
        }
        setDetalheRows(res.data)
      } finally {
        setDetalheLoading(false)
      }
    },
    [filtroInicial],
  )

  const fecharDetalhe = useCallback(() => {
    setDetalheOperador(null)
    setDetalheRows([])
    setSelecionados(new Set())
  }, [])

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
        emitGerenteToast({ kind: 'error', message: res.error })
        return
      }

      setSelecionados(new Set())
      emitGerenteToast({ kind: 'success', message: labels.marcadoSucesso })
      await abrirDetalhe(detalheOperador)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : labels.erroPagarFallback
      setError(msg)
      emitGerenteToast({ kind: 'error', message: msg })
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
      prev.size === pendentes.length ? new Set() : new Set(pendentes),
    )
  }

  const totalPendenteSelecionado = detalheRows
    .filter((r) => r.status === 'pendente' && selecionados.has(r.comissao_id))
    .reduce((s, r) => s + r.valor_comissao, 0)

  const columns: Column<ComissaoResumoRow>[] = [
    {
      key: 'operador',
      header: labels.colOperador,
      priority: 'primary',
      sortValue: (r) => r.operador_nome,
      cell: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void abrirDetalhe(r)
          }}
          className="font-medium text-jl-accent underline-offset-2 transition-colors hover:underline"
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
        <span className={moneyStatusClass('pago')}>{formatBRL(r.total_pago)}</span>
      ),
    },
    {
      key: 'comissao_pendente',
      header: labels.colPendente,
      align: 'right',
      priority: 'primary',
      sortValue: (r) => r.total_pendente,
      cell: (r) => (
        <span className={moneyStatusClass('pendente')}>{formatBRL(r.total_pendente)}</span>
      ),
    },
    {
      key: 'acoes',
      header: labels.colAcoes,
      align: 'right',
      priority: 'contextual',
      cell: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void abrirDetalhe(r)
          }}
          className="admin-v2-btn-secondary px-2.5 py-1 text-[11px]"
        >
          {labels.verDetalhes}
        </button>
      ),
    },
  ]

  const statusDisplay = statusDisplayMap[filtroInicial.status] ?? filtroInicial.status
  const periodoSub = `${labels.periodoLabel}: ${filtroInicial.de}${labels.aSeparator}${filtroInicial.ate} · ${labels.statusLabel}: ${statusDisplay}`

  return (
    <div className="flex flex-col gap-6">
      {error && !detalheOperador ? (
        <div className="admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]" role="alert">
          {error}
        </div>
      ) : null}

      <div className="admin-v2-grid-kpi">
        <MetricCard
          label={labels.metricTotal}
          value={formatBRL(kpis.total)}
          icon="dollar-sign"
          tone="gold"
        />
        <MetricCard
          label={labels.metricPago}
          value={formatBRL(kpis.pago)}
          icon="file-check-2"
          tone="success"
        />
        <MetricCard
          label={labels.metricPendente}
          value={formatBRL(kpis.pendente)}
          icon="alert-circle"
          tone="warning"
        />
      </div>

      <SectionCard
        title={labels.operadoresTitulo.replace('{{n}}', String(rows.length))}
        subtitle={periodoSub}
      >
        <DataTable
          data={rows}
          columns={columns}
          rowKey={(r) => r.operador_id}
          onRowClick={(r) => void abrirDetalhe(r)}
          emptyState={
            <EmptyState
              title={labels.vazioComissoes}
              description={labels.vazioComissoesSub}
              icon={<Percent className="h-6 w-6" aria-hidden />}
              actionLabel={labels.vazioCta}
              onAction={focusFiltros}
            />
          }
          className="rounded-none border-x-0 border-[var(--color-border-secondary)]"
        />
      </SectionCard>

      {detalheOperador ? (
        <ComissoesDetailSheet
          operador={detalheOperador}
          rows={detalheRows}
          loading={detalheLoading}
          error={error}
          selecionados={selecionados}
          totalPendenteSelecionado={totalPendenteSelecionado}
          labels={labels}
          onClose={fecharDetalhe}
          onToggle={toggleSelecionado}
          onToggleTodos={toggleTodos}
          onMarcarPagas={() => void marcarPagas()}
        />
      ) : null}
    </div>
  )
}
