'use client'

/**
 * FastProduct Admin — ComissoesContent
 *
 * Resumo por operador + sheet de detalhe + liquidação. Reutiliza actions de
 * /gerente/comissoes (sem alterar contratos).
 *
 * Semântica líquida (DB-05 A→F, reconciliação frontend↔backend): os totais e
 * o detalhe vêm de `resumo_comissoes_por_operador` / `detalhe_comissoes_operador`,
 * que projetam as views certificadas `comissoes_reconstrucao_auditoria` e
 * `comissoes_ajustes_auditoria` — nada aqui recalcula fato financeiro.
 */

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Percent } from 'lucide-react'
import { MetricCard, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/feedback'
import { formatBRL } from '@/lib/format/money'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type {
  ComissaoResumoRow,
  ComissaoDetalheRow,
  FiltroComissoes,
  LiquidacaoResultado,
} from '@/app/gerente/comissoes/actions'
import {
  carregarDetalheComissoes,
  marcarComissoesPagas,
} from '@/app/gerente/comissoes/actions'
import { ComissoesDetailSheet } from './ComissoesDetailSheet'
import { LiquidacaoResultModal } from './LiquidacaoResultModal'
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

function saldoToneClass(valor: number): string {
  if (valor > 0) return 'text-[12px] font-medium text-[var(--color-warning-strong)]'
  if (valor < 0) return 'text-[12px] font-medium text-[var(--color-danger-strong)]'
  return 'text-[12px] text-jl-fg-3'
}

export function ComissoesContent({ dados, filtroInicial, labels }: Props) {
  const router = useRouter()
  const [rows] = useState(dados)
  const [detalheOperador, setDetalheOperador] = useState<ComissaoResumoRow | null>(null)
  const [detalheRows, setDetalheRows] = useState<ComissaoDetalheRow[]>([])
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [liquidacaoResultado, setLiquidacaoResultado] = useState<LiquidacaoResultado | null>(null)
  const [marcandoPagas, setMarcandoPagas] = useState(false)

  const kpis = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.bruto += r.totalComissaoBruta
        acc.ajustes += r.totalAjustes
        acc.liquidoPago += r.totalLiquidoPago
        acc.saldoResidual += r.totalSaldoResidual
        return acc
      },
      { bruto: 0, ajustes: 0, liquidoPago: 0, saldoResidual: 0 },
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
        const res = await carregarDetalheComissoes(row.operadorId, filtroInicial)
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
    setMarcandoPagas(true)

    try {
      const res = await marcarComissoesPagas({
        operador_id: detalheOperador.operadorId,
        ids: Array.from(selecionados),
      })
      if (!res.success) {
        setError(res.error)
        emitGerenteToast({ kind: 'error', message: res.error })
        return
      }

      setSelecionados(new Set())
      setLiquidacaoResultado(res.data)
      emitGerenteToast({ kind: 'success', message: labels.marcadoSucesso })
      await abrirDetalhe(detalheOperador)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : labels.erroPagarFallback
      setError(msg)
      emitGerenteToast({ kind: 'error', message: msg })
    } finally {
      setMarcandoPagas(false)
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
      .map((r) => r.comissaoId)
    setSelecionados((prev) =>
      prev.size === pendentes.length ? new Set() : new Set(pendentes),
    )
  }

  const totalBrutoSelecionado = detalheRows
    .filter((r) => r.status === 'pendente' && selecionados.has(r.comissaoId))
    .reduce((s, r) => s + r.valorOriginal, 0)

  const columns: Column<ComissaoResumoRow>[] = [
    {
      key: 'operador',
      header: labels.colOperador,
      priority: 'primary',
      sortValue: (r) => r.operadorNome,
      cell: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void abrirDetalhe(r)
          }}
          className="font-medium text-jl-accent underline-offset-2 transition-colors hover:underline"
        >
          {r.operadorNome}
        </button>
      ),
    },
    {
      key: 'vendas',
      header: labels.colVendas,
      align: 'right',
      sortValue: (r) => r.totalVendas,
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{r.totalVendas}</span>,
    },
    {
      key: 'bruto',
      header: labels.colBruto,
      align: 'right',
      sortValue: (r) => r.totalComissaoBruta,
      cell: (r) => (
        <span className="text-[12px] font-medium text-jl-fg-1">
          {formatBRL(r.totalComissaoBruta)}
        </span>
      ),
    },
    {
      key: 'ajustes',
      header: labels.colAjustes,
      align: 'right',
      sortValue: (r) => r.totalAjustes,
      cell: (r) => (
        <span className="text-[12px] text-jl-fg-3">
          {r.totalAjustes > 0 ? `−${formatBRL(r.totalAjustes)}` : formatBRL(0)}
        </span>
      ),
    },
    {
      key: 'liquido_pago',
      header: labels.colLiquidoPago,
      align: 'right',
      sortValue: (r) => r.totalLiquidoPago,
      cell: (r) => (
        <span className="text-[12px] text-[var(--color-success-strong)]">
          {formatBRL(r.totalLiquidoPago)}
        </span>
      ),
    },
    {
      key: 'saldo_residual',
      header: labels.colSaldoResidual,
      align: 'right',
      priority: 'primary',
      sortValue: (r) => r.totalSaldoResidual,
      cell: (r) => <span className={saldoToneClass(r.totalSaldoResidual)}>{formatBRL(r.totalSaldoResidual)}</span>,
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
          label={labels.metricBruto}
          value={formatBRL(kpis.bruto)}
          icon="dollar-sign"
          tone="gold"
        />
        <MetricCard
          label={labels.metricAjustes}
          value={kpis.ajustes > 0 ? `−${formatBRL(kpis.ajustes)}` : formatBRL(0)}
          icon="alert-circle"
          tone="danger"
        />
        <MetricCard
          label={labels.metricLiquidoPago}
          value={formatBRL(kpis.liquidoPago)}
          icon="file-check-2"
          tone="success"
        />
        <MetricCard
          label={labels.metricSaldoResidual}
          value={formatBRL(kpis.saldoResidual)}
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
          rowKey={(r) => r.operadorId}
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
          totalBrutoSelecionado={totalBrutoSelecionado}
          marcandoPagas={marcandoPagas}
          labels={labels}
          onClose={fecharDetalhe}
          onToggle={toggleSelecionado}
          onToggleTodos={toggleTodos}
          onMarcarPagas={() => void marcarPagas()}
        />
      ) : null}

      {liquidacaoResultado ? (
        <LiquidacaoResultModal
          resultado={liquidacaoResultado}
          labels={labels}
          onClose={() => setLiquidacaoResultado(null)}
        />
      ) : null}
    </div>
  )
}
